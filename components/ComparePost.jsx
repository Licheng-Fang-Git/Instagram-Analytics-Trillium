'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSummary, getAllPostDates } from '@/app/compare/actions';
import {
  interpolateValue,
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
];

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}
function labelFor(code) {
  return POST_OPTIONS.find((p) => p.code === code)?.label || code;
}
// Engagement rate = interactions / reach, as a percentage.
function engRate(m) {
  const reach = Number(m?.reach) || 0;
  if (!reach) return 0;
  return (
    (((Number(m.likes) || 0) + (Number(m.saves) || 0) + (Number(m.comments) || 0) + (Number(m.shares) || 0)) /
      reach) *
    100
  );
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
// window becomes a "X was posted here" marker sitting on this line.
function getCrossPostMarks(slot, allPostDates, ownPoints) {
  if (!allPostDates || !ownPoints.length) return [];
  const ownStart = ownPoints[0][0];
  const ownEnd = ownPoints[ownPoints.length - 1][0];
  return POST_OPTIONS.filter((opt) => opt.code !== slot.selected.code)
    .map((opt) => ({ opt, meta: allPostDates[opt.code] }))
    .filter(({ meta }) => meta && meta.postedAt > ownStart && meta.postedAt <= ownEnd)
    .map(({ opt, meta }) => ({
      name: opt.label,
      link: meta.link,
      coord: [meta.postedAt, interpolateValue(ownPoints, meta.postedAt)],
    }));
}

function markPoint(color, data) {
  return {
    symbol: 'circle',
    symbolSize: 6,
    itemStyle: { color: '#0d0d0d', borderColor: color, borderWidth: 1.6 },
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

  const matches = POST_OPTIONS.filter(
    (opt) =>
      !excludeCodes.includes(opt.code) &&
      (opt.code.toLowerCase().includes(query.trim().toLowerCase()) ||
        opt.label.toLowerCase().includes(query.trim().toLowerCase()))
  );

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

  const [slots, setSlots] = useState([
    { id: 0, ...EMPTY_SLOT },
    { id: 1, ...EMPTY_SLOT },
  ]);
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
  // changes. Each selected post is one series in its slot color.
  useEffect(() => {
    const specs = [
      { ref: cumulativeRef, inst: cumulativeInst, key: 'cumulative' },
      { ref: intervalRef, inst: intervalInst, key: 'interval' },
    ];

    const cleanups = [];
    specs.forEach(({ ref, inst, key }) => {
      if (!ref.current) return;
      if (!inst.current) inst.current = echarts.init(ref.current);
      const chart = inst.current;

      const series = activeSlots.map(({ slot, color }) => {
        const filtered = seriesForBucket(slot.series.rows, bucket);
        const points = filtered[key];
        return {
          name: slot.selected.label,
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: points,
          lineStyle: { width: 2.25, color },
          itemStyle: { color },
          markPoint: markPoint(color, getCrossPostMarks(slot, allPostDates, points)),
        };
      });

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
          grid: { top: 16, left: 8, right: 16, bottom: 40, containLabel: true },
          xAxis: {
            type: 'time',
            axisLine,
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { ...axisLabel, formatter: formatAxisDateTimeShort, rotate: 38, hideOverlap: true },
          },
          yAxis: valueAxis(),
          series,
        },
        { notMerge: true }
      );

      const onClick = (params) => {
        if (params.componentType === 'markPoint' && params.data?.link) {
          window.open(params.data.link, '_blank', 'noopener,noreferrer');
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

  // Head-to-head compares the first two selected posts (in their chart colors).
  const h2hSlots = activeSlots.slice(0, 2);
  const showH2H = h2hSlots.length === 2;
  const mA = h2hSlots[0]?.slot.series.metrics;
  const mB = h2hSlots[1]?.slot.series.metrics;
  const h2hRows = showH2H
    ? [
        { label: 'Views', a: Number(mA.views) || 0, b: Number(mB.views) || 0 },
        { label: 'Reach', a: Number(mA.reach) || 0, b: Number(mB.reach) || 0 },
        { label: 'Likes', a: Number(mA.likes) || 0, b: Number(mB.likes) || 0 },
        { label: 'Saves', a: Number(mA.saves) || 0, b: Number(mB.saves) || 0 },
        { label: 'Shares', a: Number(mA.shares) || 0, b: Number(mB.shares) || 0 },
        { label: 'Follows', a: Number(mA.follows) || 0, b: Number(mB.follows) || 0 },
        { label: 'Engagement rate', a: engRate(mA), b: engRate(mB), pct: true },
      ]
    : [];

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
            excludeCodes={slots
              .filter((_, i) => i !== index)
              .map((s) => s.selected?.code)
              .filter(Boolean)}
            isSelected={Boolean(slot.selected)}
            onRemove={() => removeSlot(index)}
            canRemove={slots.length > 1}
          />
        ))}
        {slots.length < POST_OPTIONS.length && (
          <button
            type="button"
            onClick={addSlot}
            className="flex-none border border-[#2a2a2a] bg-black px-4 py-[11px] font-display text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:border-[#ebffa8] hover:bg-[#ebffa8] hover:text-[#0d0d0d]"
          >
            + Add post
          </button>
        )}
      </div>

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

      {/* Cumulative chart */}
      <div className="border border-[#1f1f1f] bg-[#121212]">
        <div className="flex items-baseline justify-between border-b border-[#1f1f1f] px-6 py-5">
          <h4 className="font-display text-[16px] font-semibold text-white">Cumulative Views</h4>
          <span className="text-xs text-[#e6e6e6]">Bucket: {bucketLabel}</span>
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
          <span className="text-xs text-[#e6e6e6]">Bucket: {bucketLabel}</span>
        </div>
        <div className="px-6 pb-6 pt-5">
          {hasSelection ? (
            <div ref={intervalRef} className="h-[440px] w-full" />
          ) : (
            <p className="py-16 text-center text-sm text-[#e6e6e6]">Search for posts above to compare.</p>
          )}
        </div>
      </div>

      {/* Head to Head (first two selected posts) */}
      {showH2H && (
        <div className="border border-[#232323] bg-black">
          <div className="border-b border-[#1f1f1f] px-6 py-5">
            <h4 className="font-display text-[16px] font-semibold text-white">Head to Head</h4>
          </div>
          <div className="grid grid-cols-[1.1fr_1fr_1fr_0.9fr] items-center border-b border-[#1f1f1f] px-6 py-3">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
              Metric
            </span>
            <span className="flex items-center justify-end gap-1.5 text-right text-[11px] text-[#e8e8e8]">
              <span className="block h-2 w-2 flex-none" style={{ background: h2hSlots[0].color }} />
              {labelFor(h2hSlots[0].slot.selected.code)}
            </span>
            <span className="flex items-center justify-end gap-1.5 text-right text-[11px] text-[#e8e8e8]">
              <span className="block h-2 w-2 flex-none" style={{ background: h2hSlots[1].color }} />
              {labelFor(h2hSlots[1].slot.selected.code)}
            </span>
            <span className="text-right font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
              Delta
            </span>
          </div>
          {h2hRows.map((row) => {
            const delta = row.b === 0 ? 0 : ((row.a - row.b) / row.b) * 100;
            const positive = delta >= 0;
            return (
              <div
                key={row.label}
                className="grid grid-cols-[1.1fr_1fr_1fr_0.9fr] items-center border-b border-[#161616] px-6 py-3.5"
              >
                <span className="text-[13px] text-[#e8e8e8]">{row.label}</span>
                <span className="text-right font-mono text-sm text-white">
                  {row.pct ? row.a.toFixed(1) + '%' : fmt(row.a)}
                </span>
                <span className="text-right font-mono text-sm text-white">
                  {row.pct ? row.b.toFixed(1) + '%' : fmt(row.b)}
                </span>
                <span
                  className="text-right font-mono text-sm"
                  style={{ color: positive ? BRAND.accent : BRAND.subtle }}
                >
                  {(positive ? '+' : '') + delta.toFixed(0) + '%'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
