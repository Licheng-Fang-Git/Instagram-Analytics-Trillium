'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSummary, getAllPostDates } from '@/app/compare/actions';
import {
  interpolateValue,
  formatAxisDateTime,
  formatAxisDateTimeShort,
  bucketByIntervalLength,
  BUCKET_OPTIONS,
} from '@/lib/chartAggregation';
import { BRAND, brandTooltip, valueAxis, axisLabel, axisLine, seriesColor } from '@/lib/chartTheme';

const POST_OPTIONS = [
  { code: 'interns2026', label: 'Meet the 2026 Interns' },
  { code: 'micon2026', label: 'Mic On' },
  { code: 'nasdaq2026', label: 'Nasdaq Times Square' },
  { code: 'mentors2026', label: 'Meet the Mentors' },
  { code: 'ditl2026', label: 'Intern Day Reel' },
  { code: 'misconceptions2026', label: 'Misconceptions Reel' },
  { code: 'cht2026', label: 'College Hot Takes' },
  { code: 'nid2026', label: 'National Intern Day' },
  { code: 'poker2026', label: 'Poker 2026' },
];

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}
function labelFor(code) {
  return POST_OPTIONS.find((p) => p.code === code)?.label || code;
}

// Minutes per bucket, for the elapsed-time ("aligned") x-axis labels.
const BUCKET_MIN = { '0:15': 15, '0:30': 30, '1:00': 60, '6:00': 360, '24:00:00': 1440 };

// Buckets fine enough that aligning both posts from their own post time reads
// well; 24h / None stay on the shared absolute-time axis (day-by-day ticks).
const ALIGN_BUCKETS = ['0:15', '0:30', '1:00', '6:00'];
const DAY_MS = 86400000;

// A day-only axis label ("Jun 25") for the absolute-time charts.
function dayLabel(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Snap a timestamp down to local midnight. The 24h buckets end at the post's
// time-of-day (e.g. 2:42 PM), which would sit ~15h off the day-axis ticks and
// the midnight-anchored ad bars — snapping them to their day lines everything up.
function dayFloor(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A compact elapsed-time label ("15m", "1h 30m", "1d 6h") for a minute count.
function elapsedLabel(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

// The series a slot should draw for the chosen bucket. "None" plots every raw
// row on the shared time axis so posts with different timelines still line up.
function seriesForBucket(rows, bucket) {
  if (bucket === 'none') {
    return {
      cumulative: rows.map((r) => [r.tEnd, r.cumulative]),
      interval: rows.map((r) => [r.tEnd, r.views]),
    };
  }
  return bucketByIntervalLength(rows, bucket);
}

// For a given post's line, every OTHER post that went up within its visible
// window becomes a filled "X was posted here" marker sitting on this line.
function getCrossPostMarks(slot, allPostDates, ownPoints, color) {
  if (!allPostDates || !ownPoints.length) return [];
  const ownStart = ownPoints[0][0];
  const ownEnd = ownPoints[ownPoints.length - 1][0];
  return POST_OPTIONS.filter((opt) => opt.code !== slot.selected.code)
    .map((opt) => ({ opt, meta: allPostDates[opt.code] }))
    .filter(({ meta }) => meta && meta.postedAt > ownStart && meta.postedAt <= ownEnd)
    .map(({ opt, meta }) => ({
      name: opt.label,
      link: meta.link,
      code: opt.code,
      coord: [meta.postedAt, interpolateValue(ownPoints, meta.postedAt)],
      itemStyle: { color, borderColor: '#0d0d0d', borderWidth: 1 },
    }));
}

// The two ends of an ad window rendered as distinct markers: a FILLED orange
// dot at the boost start, a HOLLOW orange ring at the boost end, so both the
// "ad turned on" and "ad turned off" moments read at a glance.
const AD_ENDS = [
  { field: 'start', name: 'Boost started', style: { color: '#ff6549', borderColor: '#0d0d0d', borderWidth: 1 } },
  { field: 'end', name: 'Boost ended', style: { color: '#0d0d0d', borderColor: '#ff6549', borderWidth: 2 } },
];

// Orange ad-window markers on the absolute-time axis (None / 24h buckets):
// one point per boost start/end that falls inside this line's visible window.
function getAdMarks(adWindows, ownPoints) {
  if (!adWindows?.length || !ownPoints.length) return [];
  const lo = ownPoints[0][0];
  const hi = ownPoints[ownPoints.length - 1][0];
  const marks = [];
  for (const w of adWindows) {
    for (const { field, name, style } of AD_ENDS) {
      const t = w[field];
      if (!Number.isFinite(t) || t < lo || t > hi) continue;
      marks.push({
        name,
        coord: [t, interpolateValue(ownPoints, t)],
        symbolSize: 11,
        itemStyle: style,
      });
    }
  }
  return marks;
}

// Same ad-window markers, but for the ALIGNED (elapsed-step) buckets, where the
// x-axis is a category index rather than a timestamp. `points` is this post's
// bucketed series ([absTEnd, value] pairs); each ad time maps to the category
// index of the bucket that first reaches it, so the marker sits on the line —
// and only ads inside this bucket view's covered timeframe are kept.
function getAdMarksAligned(adWindows, points) {
  if (!adWindows?.length || !points.length) return [];
  const lo = points[0][0];
  const hi = points[points.length - 1][0];
  const marks = [];
  for (const w of adWindows) {
    for (const { field, name, style } of AD_ENDS) {
      const t = w[field];
      if (!Number.isFinite(t) || t < lo || t > hi) continue;
      let idx = points.findIndex((p) => p[0] >= t);
      if (idx === -1) idx = points.length - 1;
      marks.push({ name, coord: [idx, points[idx][1]], symbolSize: 11, itemStyle: style });
    }
  }
  return marks;
}

// Ad-view bar data on the absolute-time axis (None / 24h): one [timestamp,
// views] bar per boosted day that falls inside this line's visible window.
function getAdViewBarsAbsolute(adViews, ownPoints) {
  if (!adViews?.length || !ownPoints.length) return [];
  const lo = ownPoints[0][0];
  const hi = ownPoints[ownPoints.length - 1][0];
  return adViews.filter((a) => a.t >= lo && a.t <= hi).map((a) => [a.t, a.views]);
}

// Ad-view bar data for the ALIGNED (elapsed-step) buckets: a length-`maxLen`
// array (one slot per category) with each boosted day's views placed at the
// bucket that first reaches it, null elsewhere — and only days inside this
// bucket view's covered timeframe are kept.
function getAdViewBarsAligned(adViews, points, maxLen) {
  const data = new Array(maxLen).fill(null);
  if (!adViews?.length || !points.length) return data;
  const lo = points[0][0];
  const hi = points[points.length - 1][0];
  for (const a of adViews) {
    if (a.t < lo || a.t > hi) continue;
    let idx = points.findIndex((p) => p[0] >= a.t);
    if (idx === -1) idx = points.length - 1;
    if (idx < maxLen) data[idx] = (data[idx] || 0) + a.views;
  }
  return data;
}

// Whether an aligned bar array actually carries any values.
function hasBars(arr) {
  return Array.isArray(arr) && arr.some((v) => v != null);
}

function markPoint(data) {
  return {
    symbol: 'circle',
    symbolSize: 9,
    label: { show: false },
    emphasis: {
      label: {
        show: true,
        formatter: '{b}',
        position: 'top',
        color: '#ffffff',
        fontFamily: BRAND.sans,
        fontWeight: 'bold',
        backgroundColor: '#000000',
        borderColor: '#2a2a2a',
        borderWidth: 1,
        padding: 5,
      },
    },
    data,
  };
}

// Typeahead search for one slot: type part of a code/name, pick from the list.
function PostSearchBox({ index, query, onQueryChange, onSelect, excludeCodes, isSelected, onRemove, canRemove, color }) {
  const [open, setOpen] = useState(false);

  // Token-based match against code + label, so multi-word queries in any order
  // work — e.g. "interns 2026" matches "Meet the 2026 Interns" / interns2026.
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = POST_OPTIONS.filter((opt) => {
    if (excludeCodes.includes(opt.code)) return false;
    const hay = `${opt.code} ${opt.label}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });

  return (
    <div className="relative w-full min-w-[220px] flex-1">
      <div className="flex items-center gap-2">
        {isSelected && <span className="block h-2.5 w-2.5 flex-none" style={{ background: color }} />}
        <input
          type="text"
          value={query}
          placeholder={`Search post ${index + 1}… (e.g. nasdaq2026)`}
          className={`w-full border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-[11px] font-mono text-[13px] text-white placeholder:text-[#e6e6e6] focus:border-[#ebffa8] focus:outline-none ${
            isSelected ? 'text-white' : 'text-[#e8e8e8]'
          }`}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {canRemove && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            className="flex-none px-1.5 text-[15px] leading-none text-[#e6e6e6] transition-colors hover:text-[#ebffa8]"
            aria-label={`Remove post ${index + 1}`}
          >
            ×
          </button>
        )}
      </div>
      {open && query.trim() && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto border border-[#1f1f1f] bg-[#121212] shadow-lg">
          {matches.map((opt) => (
            <li
              key={opt.code}
              className="cursor-pointer px-3.5 py-2.5 text-[13px] transition-colors hover:bg-[#1a1a1a]"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(opt);
                setOpen(false);
              }}
            >
              <span className="font-mono text-white">{opt.code}</span>
              <span className="text-[#e6e6e6]"> — {opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EMPTY_SLOT = { query: '', selected: null, series: null };

export default function ComparePost() {
  const cumulativeRef = useRef(null);
  const cumulativeInst = useRef(null);
  const intervalRef = useRef(null);
  const intervalInst = useRef(null);
  const nextSlotId = useRef(2);
  // Cache of other posts' full series (for the hover preview) + the currently
  // hovered marker token, so a slow fetch that resolves after the pointer has
  // moved on doesn't draw a stale preview.
  const seriesCacheRef = useRef(new Map());
  const hoveredRef = useRef(null);
  // Which post's preview line is currently shown on each chart (by chart key),
  // so clicking the same marker again toggles it off.
  const overlayCodeRef = useRef({});

  const [slots, setSlots] = useState([{ id: 0, ...EMPTY_SLOT }]);
  const [error, setError] = useState(null);
  const [allPostDates, setAllPostDates] = useState(null);
  const [bucket, setBucket] = useState('none');

  useEffect(() => {
    getAllPostDates().then(setAllPostDates).catch(() => setAllPostDates({}));
  }, []);

  function addSlot() {
    setSlots((prev) => {
      if (prev.length >= POST_OPTIONS.length) return prev;
      const id = nextSlotId.current++;
      return [...prev, { id, ...EMPTY_SLOT }];
    });
  }

  function removeSlot(index) {
    setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleQueryChange(index, value) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], query: value };
      return next;
    });
  }

  async function handleSelect(index, opt) {
    setError(null);
    const slotId = slots[index]?.id;
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], query: opt.code, selected: opt, series: null };
      return next;
    });

    try {
      const series = await getPostSummary(opt.code);
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.id === slotId);
        if (idx === -1 || prev[idx].selected?.code !== opt.code) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], series };
        return next;
      });
    } catch {
      setError(`Couldn't load data for ${opt.code}.`);
    }
  }

  const hasSelection = slots.some((slot) => slot.selected);
  const activeSlots = slots
    .map((slot, i) => ({ slot, color: seriesColor(i) }))
    .filter(({ slot }) => slot.selected && slot.series);

  // Draw the cumulative + per-interval line charts whenever selection or bucket
  // changes. For the fine buckets (15m/30m/1h/6h) the lines are ALIGNED from
  // each post's own post time (elapsed x-axis, both starting at step 0); for
  // 24h / None they stay on the shared absolute-time axis.
  useEffect(() => {
    hoveredRef.current = null;
    overlayCodeRef.current = {};
    const aligned = ALIGN_BUCKETS.includes(bucket);
    const bmin = BUCKET_MIN[bucket] || null;
    // The 24h buckets end at the post's time-of-day; snap them to the day so
    // the points sit on the day-axis ticks and line up with the ad bars.
    const dayBucket = bucket === '24:00:00';

    const perSlot = activeSlots.map(({ slot, color }) => {
      const f = seriesForBucket(slot.series.rows, bucket);
      const snap = (pts) => (dayBucket ? pts.map(([t, v]) => [dayFloor(t), v]) : pts);
      return { name: slot.selected.label, color, slot, cumulative: snap(f.cumulative), interval: snap(f.interval) };
    });
    const maxLen = Math.max(0, ...perSlot.map((p) => p.interval.length));
    const categories = aligned
      ? Array.from({ length: maxLen }, (_, i) => (bmin ? '+' + elapsedLabel((i + 1) * bmin) : 'Step ' + (i + 1)))
      : null;

    const specs = [
      { ref: cumulativeRef, inst: cumulativeInst, key: 'cumulative' },
      { ref: intervalRef, inst: intervalInst, key: 'interval' },
    ];

    const cleanups = [];
    specs.forEach(({ ref, inst, key }) => {
      if (!ref.current) return;
      if (!inst.current) inst.current = echarts.init(ref.current);
      const chart = inst.current;

      const lineSeries = perSlot.map((p, i) =>

        aligned
          ? {
              id: 'line-' + i,
              name: p.name,
              type: 'line',
              smooth: true,
              showSymbol: maxLen <= 60,
              symbol: 'circle',
              symbolSize: 5,
              connectNulls: true,
              data: Array.from({ length: maxLen }, (_, j) =>
                j < p[key].length ? Number(p[key][j][1]) || 0 : null
              ),
              lineStyle: { width: 2.25, color: p.color },
              itemStyle: { color: p.color },
              markPoint: markPoint(getAdMarksAligned(p.slot.series.adWindows, p[key])),
            }
          : {
              id: 'line-' + i,
              name: p.name,
              type: 'line',
              smooth: true,
              showSymbol: false,
              data: p[key],
              lineStyle: { width: 2.25, color: p.color },
              itemStyle: { color: p.color },
              markPoint: markPoint([
                ...getCrossPostMarks(p.slot, allPostDates, p[key], p.color),
                ...getAdMarks(p.slot.series.adWindows, p[key]),
              ]),
            }
      );

      // Ad views drawn as their own orange bars on a secondary axis (an overlay,
      // not folded into the lines) — one bar series per post that has ad-view
      // data inside this bucket view's range.
      const barSeries = [];
      perSlot.forEach((p, i) => {
        const barData = aligned
          ? getAdViewBarsAligned(p.slot.series.adViews, p[key], maxLen)
          : getAdViewBarsAbsolute(p.slot.series.adViews, p[key]);
        if (aligned ? hasBars(barData) : barData.length) {
          barSeries.push({
            id: 'bar-' + i,
            name: `${p.name} · ad views`,
            type: 'bar',
            data: barData,
            yAxisIndex: 1,
            barMaxWidth: 20,
            itemStyle: { color: 'rgba(255,101,73,0.6)' },
            z: 1,
          });
        }
      });

      const series = [...lineSeries, ...barSeries];
      const hasAdBars = barSeries.length > 0;
      const currentName = perSlot[0]?.name || '';

      // Y axes:
      //  [0] left  — the current post's views (always on).
      //  [1] right — "Ad views" for the bars (only when there are bars).
      //  [last] right — the clicked post's own scale for its preview line;
      //         hidden until a marker is clicked, at which point the "Ad views"
      //         axis + bars step aside and this shows the previewed post's data.
      const yAxes = [
        { ...valueAxis(), name: '', nameLocation: 'end', nameGap: 14, nameTextStyle: { color: '#dfdecc', align: 'left' } },
      ];
      let adAxisIndex = -1;
      if (hasAdBars) {
        adAxisIndex = yAxes.length;
        yAxes.push({
          type: 'value',
          position: 'right',
          name: 'Ad views',
          nameLocation: 'end',
          nameGap: 14,
          nameTextStyle: { color: '#dfdecc', align: 'right' },
          axisLabel: { color: '#e8e8e8' },
          splitLine: { show: false },
        });
      }
      const previewAxisIndex = yAxes.length;
      yAxes.push({
        type: 'value',
        position: 'right',
        show: false,
        scale: true,
        name: '',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { color: '#d9d4cb', align: 'right' },
        axisLabel: { color: '#d9d4cb' },
        splitLine: { show: false },
      });

      // Toggle the clicked post's preview line + its own right axis on/off.
      // Showing it hides the "Ad views" axis and its bars (they step aside for
      // the previewed post's scale); hiding it restores them.
      const showPreview = async (code) => {
        const token = `${key}:${code}`;
        hoveredRef.current = token;
        overlayCodeRef.current[key] = code;
        let s = seriesCacheRef.current.get(code);
        if (!s) {
          try {
            s = await getPostSummary(code);
            seriesCacheRef.current.set(code, s);
          } catch {
            return;
          }
        }
        if (hoveredRef.current !== token) return; // toggled/changed while loading
        let pts = seriesForBucket(s.rows, bucket)[key];
        if (dayBucket) pts = pts.map(([t, v]) => [dayFloor(t), v]);
        const yUpdate = yAxes.map(() => ({}));
        yUpdate[0] = { name: currentName };
        if (adAxisIndex >= 0) yUpdate[adAxisIndex] = { show: false };
        yUpdate[previewAxisIndex] = { show: true, name: labelFor(code) };
        chart.setOption({
          yAxis: yUpdate,
          series: [
            {
              id: 'overlay',
              name: labelFor(code) + ' · preview',
              type: 'line',
              data: pts,
              yAxisIndex: previewAxisIndex,
              smooth: true,
              showSymbol: false,
              silent: true,
              z: 0,
              lineStyle: { width: 2, color: 'rgba(217,212,203,0.65)' },
              areaStyle: { color: 'rgba(217,212,203,0.08)' },
            },
            ...barSeries.map((b) => ({ id: b.id, data: [] })),
          ],
        });
      };
      const hidePreview = () => {
        hoveredRef.current = null;
        overlayCodeRef.current[key] = null;
        const yUpdate = yAxes.map(() => ({}));
        yUpdate[0] = { name: '' };
        if (adAxisIndex >= 0) yUpdate[adAxisIndex] = { show: true };
        yUpdate[previewAxisIndex] = { show: false, name: '' };
        chart.setOption({
          yAxis: yUpdate,
          series: [{ id: 'overlay', data: [] }, ...barSeries.map((b) => ({ id: b.id, data: b.data }))],
        });
      };

      const xAxis = aligned
        ? {
            type: 'category',
            data: categories,
            name: bmin ? 'Time since post' : 'Step',
            nameLocation: 'middle',
            nameGap: 34,
            nameTextStyle: { color: BRAND.subtle, fontFamily: BRAND.sans, fontSize: 12 },
            axisLine,
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { ...axisLabel, rotate: categories.length > 12 ? 38 : 0, hideOverlap: true },
          }
        : {
            type: 'time',
            minInterval: DAY_MS,
            maxInterval: DAY_MS,
            axisLine,
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { ...axisLabel, formatter: dayLabel, rotate: 38, hideOverlap: true },
          };

      chart.setOption(
        {
          backgroundColor: 'transparent',
          tooltip: brandTooltip,
          legend: {
            bottom: 0,
            data: series.map((s) => s.name),
            textStyle: { color: BRAND.legend, fontFamily: BRAND.sans, fontSize: 12 },
            inactiveColor: '#4a4a4a',
          },
          grid: { top: 16, left: 8, right: aligned ? 8 : 16, bottom: aligned ? 52 : 40, containLabel: true },
          xAxis,
          yAxis: yAxes,
          series,
        },
        { notMerge: true }
      );

      // Click a published-post marker to toggle its translucent preview line.
      // (Hovering just reveals the marker's name via the emphasis label.)
      const onClick = (params) => {
        if (params.componentType === 'markPoint' && params.data?.code) {
          if (overlayCodeRef.current[key] === params.data.code) {
            hidePreview();
          } else {
            showPreview(params.data.code);
          }
        }
      };
      chart.on('click', onClick);

      const onResize = () => chart.resize();
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        chart.off('click', onClick);
        window.removeEventListener('resize', onResize);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [slots, allPostDates, bucket]);

  useEffect(() => {
    return () => {
      cumulativeInst.current?.dispose();
      intervalInst.current?.dispose();
    };
  }, []);

  const bucketLabel = BUCKET_OPTIONS.find((o) => o.value === bucket)?.label || bucket;
  const alignedMode = ALIGN_BUCKETS.includes(bucket);
  const lineAxisNote = alignedMode ? `Aligned from post time · ${bucketLabel}` : `Absolute time · ${bucketLabel}`;

  // Per-post summary for the selected bucket: the number each post "got to",
  // how many buckets it took, and its biggest single-bucket surge — so a bucket
  // click surfaces a readable number, not just a rising line.
  const bucketSummaries = activeSlots.map(({ slot, color }) => {
    const gains = seriesForBucket(slot.series.rows, bucket).interval.map(([t, v]) => ({
      t,
      v: Number(v) || 0,
    }));
    const total = gains.reduce((a, g) => a + g.v, 0);
    const peak = gains.reduce((mx, g) => (g.v > mx.v ? g : mx), { v: -Infinity, t: null });
    return { name: slot.selected.label, color, total, count: gains.length, peak: peak.t ? peak : null };
  });

  return (
    <div className="flex flex-col gap-7">
      {/* Search + add */}
      <div className="flex flex-wrap items-start gap-4 border border-[#1f1f1f] bg-[#121212] px-6 py-5">
        {slots.map((slot, index) => (
          <PostSearchBox
            key={slot.id}
            index={index}
            query={slot.query}
            color={seriesColor(index)}
            onQueryChange={(v) => handleQueryChange(index, v)}
            onSelect={(opt) => handleSelect(index, opt)}
            excludeCodes={[]}
            isSelected={Boolean(slot.selected)}
            canRemove={false}
          />
        ))}
      </div>

      {hasSelection && (
        <div className="flex flex-wrap items-center gap-5 text-[11px] text-[#a8a8a8]">
          <span className="flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rounded-full bg-[#ebffa8]" /> Other posts published (click to preview)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rounded-full bg-[#ff6549]" /> Boost started
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block h-2.5 w-2.5 rounded-full border-2 border-[#ff6549] bg-[#0d0d0d]" /> Boost ended
          </span>
        </div>
      )}

      {error && <p className="text-sm text-[#ff6549]">{error}</p>}

      {/* Bucket controls */}
      <div className="flex flex-wrap items-center gap-4 border border-[#1f1f1f] bg-[#121212] px-6 py-4">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
          Bucket size
        </span>
        <div className="flex flex-wrap gap-2">
          {BUCKET_OPTIONS.map((o) => {
            const active = bucket === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setBucket(o.value)}
                className={`border px-3.5 py-2 font-mono text-xs transition-all ${
                  active
                    ? 'border-[#ebffa8] bg-[#1f1f1f] text-[#ebffa8]'
                    : 'border-[#2a2a2a] bg-transparent text-[#e8e8e8] hover:border-[rgba(235,255,168,0.35)] hover:text-[#ebffa8]'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-[#e6e6e6]">
          Rows combine into buckets of this size, up to the data&apos;s own granularity.
        </span>
      </div>

      {/* Bucket summary — the number each post "got to" at this bucket */}
      {hasSelection && bucketSummaries.length > 0 && (
        <div className="flex flex-col gap-2.5 border border-[#1f1f1f] bg-[#121212] px-6 py-4">
          {bucketSummaries.map((s) => (
            <div key={s.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="block h-2.5 w-2.5 flex-none" style={{ background: s.color }} />
              <span className="text-white">{s.name}</span>
              <span className="text-[#a8a8a8]">got to</span>
              <span className="font-mono text-white">{fmt(s.total)} views</span>
              <span className="text-[#a8a8a8]">
                across {s.count} {s.count === 1 ? 'bucket' : 'buckets'} of {bucketLabel}
              </span>
              {s.peak && (
                <span className="text-[#a8a8a8]">
                  · biggest surge{' '}
                  <span className="font-mono text-[#ebffa8]">{fmt(s.peak.v)}</span> at{' '}
                  {formatAxisDateTimeShort(s.peak.t)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cumulative chart */}
      <div className="border border-[#1f1f1f] bg-[#121212]">
        <div className="flex items-baseline justify-between border-b border-[#1f1f1f] px-6 py-5">
          <h4 className="font-display text-[16px] font-semibold text-white">Cumulative Views</h4>
          <span className="text-xs text-[#e6e6e6]">{lineAxisNote}</span>
        </div>
        <div className="px-6 pb-6 pt-5">
          {hasSelection ? (
            <div ref={cumulativeRef} className="h-[440px] w-full" />
          ) : (
            <p className="py-16 text-center text-sm text-[#e6e6e6]">Search for posts above to compare.</p>
          )}
        </div>
      </div>

      {/* Interval chart */}
      <div className="border border-[#1f1f1f] bg-[#121212]">
        <div className="flex items-baseline justify-between border-b border-[#1f1f1f] px-6 py-5">
          <h4 className="font-display text-[16px] font-semibold text-white">Views per Interval</h4>
          <span className="text-xs text-[#e6e6e6]">{lineAxisNote}</span>
        </div>
        <div className="px-6 pb-6 pt-5">
          {hasSelection ? (
            <div ref={intervalRef} className="h-[440px] w-full" />
          ) : (
            <p className="py-16 text-center text-sm text-[#e6e6e6]">Search for posts above to compare.</p>
          )}
        </div>
      </div>
    </div>
  );
}
