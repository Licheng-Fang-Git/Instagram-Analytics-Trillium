'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSeries, getAllPostDates } from '@/app/compare/actions';
import { interpolateValue, resampleToFixedBuckets, formatAxisDateTime } from '@/lib/chartAggregation';

const POST_OPTIONS = [
  { code: 'ditl2026', label: 'Intern Day Reel' },
  { code: 'interns2026', label: 'Meet the 2026 Interns' },
  { code: 'mentors2026', label: 'Meet the Mentors' },
  { code: 'micon2026', label: 'Mic On' },
  { code: 'nasdaq2026', label: 'Nasdaq Times Square' },
  { code: 'misconceptions2026', label: 'Misconceptions Reel' },
];

const LINE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function colorFor(i) {
  return LINE_COLORS[i % LINE_COLORS.length];
}

// First derivative: views/hour between each pair of consecutive cumulative points.
// Second derivative: how much that views/hour rate itself is changing, per hour.
function computeDerivatives(cumulativePoints) {
  const velocity = [];
  for (let i = 1; i < cumulativePoints.length; i++) {
    const [t0, c0] = cumulativePoints[i - 1];
    const [t1, c1] = cumulativePoints[i];
    const hours = (t1 - t0) / (1000 * 60 * 60);
    if (hours <= 0) continue;
    velocity.push([t1, (c1 - c0) / hours]);
  }

  const acceleration = [];
  for (let i = 1; i < velocity.length; i++) {
    const [t0, v0] = velocity[i - 1];
    const [t1, v1] = velocity[i];
    const hours = (t1 - t0) / (1000 * 60 * 60);
    if (hours <= 0) continue;
    acceleration.push([t1, (v1 - v0) / hours]);
  }

  return { velocity, acceleration };
}

// The series a chart should actually draw for this post: the raw CSV-derived
// data by default, or a fixed-bucket resample if the user picked one from
// this post's aggregation control.
function getDisplaySeries(slot) {
  if (slot.aggregation === 'raw') {
    return { cumulative: slot.series.cumulative, interval: slot.series.interval };
  }
  return resampleToFixedBuckets(slot.series.cumulative, slot.aggregation);
}

// For a given post's line, find every OTHER post (from the full catalog, not
// just the other selected slot) that went up after this one and before this
// one's data ends — those are the "X was posted here" markers on this line.
// `ownPoints` is whichever series (cumulative or interval) the mark should sit on.
function getCrossPostMarks(slot, allPostDates, ownPoints) {
  if (!allPostDates) return [];
  const ownStart = ownPoints[0][0];
  const ownEnd = ownPoints[ownPoints.length - 1][0];

  return POST_OPTIONS.filter((opt) => opt.code !== slot.selected.code)
    .map((opt) => ({ opt, meta: allPostDates[opt.code] }))
    .filter(({ meta }) => meta && meta.postedAt > ownStart && meta.postedAt <= ownEnd)
    .map(({ opt, meta }) => ({
      name: opt.label,
      link: meta.link,
      coord: [meta.postedAt, interpolateValue(ownPoints, meta.postedAt)],
      cursor: meta.link ? 'pointer' : 'default',
    }));
}

function summarizeSeries(points) {
  if (!points.length) return null;
  let peak = points[0];
  let trough = points[0];
  points.forEach((p) => {
    if (p[1] > peak[1]) peak = p;
    if (p[1] < trough[1]) trough = p;
  });
  return { peak, trough, current: points[points.length - 1] };
}

// Mean of whichever velocity points fall inside [from, to]; falls back to a
// single interpolated reading if the window happens to contain no samples
// (common once data thins out to 12-24hr buckets).
function averageVelocityInWindow(velocityPoints, from, to) {
  const inWindow = velocityPoints.filter(([t]) => t >= from && t <= to);
  if (inWindow.length > 0) {
    return inWindow.reduce((sum, [, v]) => sum + v, 0) / inWindow.length;
  }
  return interpolateValue(velocityPoints, (from + to) / 2);
}

// Finds significant local-maximum spikes in a "views per interval" series —
// a point counts only if it's higher than both neighbors AND well above the
// average of the points around it, so ordinary noise doesn't get flagged.
// Keeps only the strongest few so a spiky post doesn't flood the impact list.
function detectSpikes(intervalPoints, { neighborhoodSize = 5, multiplier = 2, maxSpikes = 3 } = {}) {
  const candidates = [];
  for (let i = 1; i < intervalPoints.length - 1; i++) {
    const [t, v] = intervalPoints[i];
    const isLocalMax = v > intervalPoints[i - 1][1] && v > intervalPoints[i + 1][1];
    if (!isLocalMax) continue;

    const start = Math.max(0, i - neighborhoodSize);
    const end = Math.min(intervalPoints.length, i + neighborhoodSize + 1);
    const neighbors = intervalPoints.slice(start, end).filter((_, idx) => start + idx !== i);
    if (!neighbors.length) continue;
    const baseline = neighbors.reduce((sum, [, val]) => sum + val, 0) / neighbors.length;

    if (baseline > 0 && v >= baseline * multiplier) {
      candidates.push({ t, v, ratio: v / baseline });
    }
  }

  return candidates
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, maxSpikes)
    .sort((a, b) => a.t - b.t);
}

// Every notable moment in a post's timeline: when it launched, plus any big
// spikes in its views-per-interval — each is a candidate "catalyst" that
// might affect another post's velocity around that same time.
function getCatalystEvents(slot) {
  const events = [{ at: slot.series.cumulative[0][0], reason: 'launched' }];
  detectSpikes(slot.series.interval).forEach((spike) => {
    events.push({ at: spike.t, reason: `spiked to ${Math.round(spike.v).toLocaleString()} views/hr` });
  });
  return events;
}

// "Did another post's launch or a sudden spike in it help or hurt this
// post's velocity?" For every ordered pair of selected posts, and every
// notable event in the "catalyst" post's timeline that falls inside the
// "affected" post's own live window, compares the affected post's velocity
// in the 24h before vs the 24h after that event.
function computeCatalystImpacts(activeSlots) {
  if (activeSlots.length < 2) return [];
  const WINDOW_HOURS = 24;
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  const impacts = [];

  activeSlots.forEach((affected) => {
    const ownPoints = affected.series.cumulative;
    const ownStart = ownPoints[0][0];
    const ownEnd = ownPoints[ownPoints.length - 1][0];
    const { velocity } = computeDerivatives(ownPoints);
    if (velocity.length < 2) return;

    activeSlots.forEach((catalyst) => {
      if (catalyst === affected) return;

      getCatalystEvents(catalyst).forEach((event) => {
        if (event.at <= ownStart || event.at > ownEnd) return;

        const before = averageVelocityInWindow(velocity, event.at - windowMs, event.at);
        const after = averageVelocityInWindow(velocity, event.at, event.at + windowMs);
        const percentChange = before > 0 ? ((after - before) / before) * 100 : null;

        impacts.push({
          affectedLabel: affected.selected.label,
          catalystLabel: catalyst.selected.label,
          catalystAt: event.at,
          reason: event.reason,
          before,
          after,
          percentChange,
        });
      });
    });
  });

  return impacts.sort((a, b) => a.catalystAt - b.catalystAt);
}

// Pearson correlation coefficient between two equal-length numeric arrays.
function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function possessive(label) {
  return label.endsWith('s') ? `${label}'` : `${label}'s`;
}

function describeCatalystImpact(percentChange) {
  if (percentChange === null) return { verb: 'changed', color: 'text-gray-700' };
  if (percentChange >= 10) return { verb: 'helped', color: 'text-emerald-600' };
  if (percentChange <= -10) return { verb: 'hurt', color: 'text-red-500' };
  return { verb: 'barely affected', color: 'text-gray-500' };
}

function describeCorrelation(r) {
  if (r === null) return 'Not enough variation to compute';
  const abs = Math.abs(r);
  const strength = abs >= 0.7 ? 'Strong' : abs >= 0.4 ? 'Moderate' : abs >= 0.2 ? 'Weak' : 'Little to no';
  const direction = r >= 0 ? 'positive' : 'negative';
  return `${strength} ${direction} correlation`;
}

// Restricts both posts' velocity curves to the calendar window where both
// were actually live at the same time, and correlates them over that window.
// Returns null if their live periods never overlap.
function computeVelocityOverlap(slotA, slotB) {
  const velA = computeDerivatives(slotA.series.cumulative).velocity;
  const velB = computeDerivatives(slotB.series.cumulative).velocity;
  if (velA.length < 2 || velB.length < 2) return null;

  const start = Math.max(velA[0][0], velB[0][0]);
  const end = Math.min(velA[velA.length - 1][0], velB[velB.length - 1][0]);
  if (start >= end) return null;

  const SAMPLE_COUNT = 40;
  const seriesA = [];
  const seriesB = [];
  const samplesA = [];
  const samplesB = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = start + ((end - start) * i) / (SAMPLE_COUNT - 1);
    const vA = interpolateValue(velA, t);
    const vB = interpolateValue(velB, t);
    seriesA.push([t, vA]);
    seriesB.push([t, vB]);
    samplesA.push(vA);
    samplesB.push(vB);
  }

  return {
    start,
    end,
    seriesA,
    seriesB,
    correlation: pearsonCorrelation(samplesA, samplesB),
  };
}

function pairKey(labelA, labelB) {
  return [labelA, labelB].sort().join('__');
}

// Every unique pair among the selected posts, each with its velocity-overlap
// correlation. Backs both the Velocity Correlation section (a chart for
// exactly 2 posts, a ranked list for more) and which Catalyst Impact entries
// are worth showing — a pair with little to no correlation isn't relationship
// evidence, just noise from two curves that happen to overlap in time.
function computePairwiseCorrelations(activeSlots) {
  const pairs = [];
  for (let i = 0; i < activeSlots.length; i++) {
    for (let j = i + 1; j < activeSlots.length; j++) {
      const overlap = computeVelocityOverlap(activeSlots[i], activeSlots[j]);
      const hasMeaningful =
        overlap !== null && overlap.correlation !== null && Math.abs(overlap.correlation) >= 0.2;
      pairs.push({
        labelA: activeSlots[i].selected.label,
        labelB: activeSlots[j].selected.label,
        overlap,
        hasMeaningful,
      });
    }
  }
  return pairs;
}

// "Is it still growing or dead?" — compare recent velocity to this post's own
// peak. Thresholds are relative to its own peak, not an absolute view count,
// so it works the same way for a post that peaked at 500/hr or 50,000/hr.
function classifyGrowthStatus(velocityPoints) {
  if (velocityPoints.length < 2) return null;
  const peak = Math.max(...velocityPoints.map(([, v]) => v));
  const tail = velocityPoints.slice(-3);
  const recent = tail.reduce((sum, [, v]) => sum + v, 0) / tail.length;
  if (peak <= 0) return null;

  const ratio = recent / peak;
  if (ratio < 0.05) return { label: 'Down', color: 'bg-gray-200 text-gray-600' };
  if (ratio < 0.25) return { label: 'Slowing', color: 'bg-amber-100 text-amber-700' };
  return { label: 'Growing', color: 'bg-emerald-100 text-emerald-700' };
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="font-semibold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function PostSearchBox({ index, query, onQueryChange, onSelect, excludeCodes, isSelected, onRemove, canRemove }) {
  const [open, setOpen] = useState(false);

  const matches = POST_OPTIONS.filter(
    (opt) =>
      !excludeCodes.includes(opt.code) &&
      opt.code.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={query}
          placeholder={`Search post ${index + 1}... (e.g. nasdaq2026)`}
          className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            isSelected ? 'text-black font-bold' : 'text-gray-700 font-normal'
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
            className="shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none px-1"
            aria-label={`Remove post ${index + 1}`}
          >
            ×
          </button>
        )}
      </div>
      {open && query.trim() && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-auto">
          {matches.map((opt) => (
            <li
              key={opt.code}
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(opt);
                setOpen(false);
              }}
            >
              <span className="font-medium">{opt.code}</span>
              <span className="text-gray-400"> — {opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EMPTY_SLOT = { query: '', selected: null, series: null, aggregation: 'raw' };

export default function ComparePost() {
  const cumulativeChartRef = useRef(null);
  const cumulativeInstanceRef = useRef(null);
  const intervalChartRef = useRef(null);
  const intervalInstanceRef = useRef(null);
  const correlationChartRef = useRef(null);
  const correlationInstanceRef = useRef(null);
  const intervalBarChartRef = useRef(null);
  const intervalBarInstanceRef = useRef(null);
  const nextSlotId = useRef(2);

  const [slots, setSlots] = useState([
    { id: 0, ...EMPTY_SLOT },
    { id: 1, ...EMPTY_SLOT },
  ]);
  const [error, setError] = useState(null);
  const [allPostDates, setAllPostDates] = useState(null);

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

  function handleAggregationChange(slotId, value) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, aggregation: value } : s)));
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
      const series = await getPostSeries(opt.code);
      setSlots((prev) => {
        // Bail out if this slot was removed or changed to something else
        // while the fetch was in flight.
        const idx = prev.findIndex((s) => s.id === slotId);
        if (idx === -1 || prev[idx].selected?.code !== opt.code) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], series };
        return next;
      });
    } catch (err) {
      setError(`Couldn't load data for ${opt.code}.`);
    }
  }

  const hasSelection = slots.some((slot) => slot.selected);
  const selectedCount = slots.filter((slot) => slot.selected).length;
  const activeSlots = slots.filter((slot) => slot.selected && slot.series);
  // True once at least 2 posts are picked but before all their data has
  // loaded — used to show a stable loading state instead of flickering
  // chart containers in and out as fetches resolve.
  const isLoadingSelections = selectedCount >= 2 && activeSlots.length < selectedCount;

  const derivativeStats = activeSlots.map((slot) => {
    const { velocity, acceleration } = computeDerivatives(slot.series.cumulative);
    return {
      slot,
      velocityStats: summarizeSeries(velocity),
      accelerationStats: summarizeSeries(acceleration),
      growthStatus: classifyGrowthStatus(velocity),
    };
  });

  const catalystImpacts = computeCatalystImpacts(activeSlots);
  const pairwiseCorrelations = computePairwiseCorrelations(activeSlots);
  const meaningfulPairs = pairwiseCorrelations.filter((p) => p.hasMeaningful);
  const meaningfulPairKeys = new Set(meaningfulPairs.map((p) => pairKey(p.labelA, p.labelB)));
  const visibleCatalystImpacts = catalystImpacts.filter((impact) =>
    meaningfulPairKeys.has(pairKey(impact.affectedLabel, impact.catalystLabel))
  );
  const primaryPair = activeSlots.length === 2 ? pairwiseCorrelations[0] ?? null : null;
  const showCorrelationCard = selectedCount >= 2 && (isLoadingSelections || meaningfulPairs.length > 0);

  useEffect(() => {
    if (!cumulativeChartRef.current) return;
    if (!cumulativeInstanceRef.current) {
      cumulativeInstanceRef.current = echarts.init(cumulativeChartRef.current);
    }
    const chart = cumulativeInstanceRef.current;

    const series = activeSlots.map((slot, i) => {
      const display = getDisplaySeries(slot);
      return {
        name: slot.selected.label,
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: display.cumulative,
        lineStyle: { width: 3 },
        itemStyle: { color: colorFor(i) },
        markPoint: {
          symbol: 'circle',
          symbolSize: 14,
          itemStyle: { color: 'transparent', borderColor: colorFor(i), borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              formatter: '{b}',
              position: 'top',
              color: '#111827',
              fontWeight: 'bold',
              backgroundColor: '#fff',
              padding: 4,
              borderRadius: 4,
            },
          },
          data: getCrossPostMarks(slot, allPostDates, display.cumulative),
        },
      };
    });

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: series.map((s) => s.name) },
        grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
        xAxis: {
          type: 'time',
          name: 'Date',
          nameLocation: 'middle',
          nameGap: 60,
          axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: { type: 'value', name: 'Cumulative Views' },
        series,
      },
      { notMerge: true }
    );

    const handleMarkPointClick = (params) => {
      if (params.componentType === 'markPoint' && params.data?.link) {
        window.open(params.data.link, '_blank', 'noopener,noreferrer');
      }
    };
    chart.on('click', handleMarkPointClick);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.off('click', handleMarkPointClick);
    };
  }, [slots, allPostDates]);

  useEffect(() => {
    if (!intervalChartRef.current) return;
    if (!intervalInstanceRef.current) {
      intervalInstanceRef.current = echarts.init(intervalChartRef.current);
    }
    const chart = intervalInstanceRef.current;

    const series = activeSlots.map((slot, i) => {
      const display = getDisplaySeries(slot);
      return {
        name: slot.selected.label,
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: display.interval,
        lineStyle: { width: 3 },
        itemStyle: { color: colorFor(i) },
        markPoint: {
          symbol: 'circle',
          symbolSize: 14,
          itemStyle: { color: 'transparent', borderColor: colorFor(i), borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              formatter: '{b}',
              position: 'top',
              color: '#111827',
              fontWeight: 'bold',
              backgroundColor: '#fff',
              padding: 4,
              borderRadius: 4,
            },
          },
          data: getCrossPostMarks(slot, allPostDates, display.interval),
        },
      };
    });

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: series.map((s) => s.name) },
        grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
        xAxis: {
          type: 'time',
          name: 'Date',
          nameLocation: 'middle',
          nameGap: 60,
          axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: { type: 'value', name: 'Views in Interval' },
        series,
      },
      { notMerge: true }
    );

    const handleMarkPointClick = (params) => {
      if (params.componentType === 'markPoint' && params.data?.link) {
        window.open(params.data.link, '_blank', 'noopener,noreferrer');
      }
    };
    chart.on('click', handleMarkPointClick);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.off('click', handleMarkPointClick);
    };
  }, [slots, allPostDates]);

  useEffect(() => {
    if (!correlationChartRef.current) return;
    // This card's chart only exists for the exactly-2-posts case and can
    // hide/reappear based on the pair's correlation strength or the post
    // count changing, so its container can genuinely unmount and remount —
    // if the previous instance's DOM node is no longer in the document,
    // it's stale; dispose it before creating a fresh one.
    if (correlationInstanceRef.current && !correlationInstanceRef.current.getDom()?.isConnected) {
      correlationInstanceRef.current.dispose();
      correlationInstanceRef.current = null;
    }
    if (!correlationInstanceRef.current) {
      correlationInstanceRef.current = echarts.init(correlationChartRef.current);
    }
    const chart = correlationInstanceRef.current;

    const overlap = primaryPair?.overlap;
    const series = overlap
      ? [
          {
            name: activeSlots[0].selected.label,
            type: 'line',
            showSymbol: false,
            smooth: true,
            data: overlap.seriesA,
            lineStyle: { width: 3 },
            itemStyle: { color: colorFor(0) },
          },
          {
            name: activeSlots[1].selected.label,
            type: 'line',
            showSymbol: false,
            smooth: true,
            data: overlap.seriesB,
            lineStyle: { width: 3 },
            itemStyle: { color: colorFor(1) },
          },
        ]
      : [];

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: series.map((s) => s.name) },
        grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
        xAxis: {
          type: 'time',
          name: 'Date',
          nameLocation: 'middle',
          nameGap: 60,
          axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: { type: 'value', name: 'Views/hr (velocity)' },
        series,
      },
      { notMerge: true }
    );

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [slots]);

  useEffect(() => {
    if (!intervalBarChartRef.current) return;
    if (!intervalBarInstanceRef.current) {
      intervalBarInstanceRef.current = echarts.init(intervalBarChartRef.current);
    }
    const chart = intervalBarInstanceRef.current;

    const series = activeSlots.map((slot, i) => ({
      name: slot.selected.label,
      type: 'bar',
      barMaxWidth: 3,
      data: getDisplaySeries(slot).interval,
      itemStyle: { color: colorFor(i) },
    }));

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: series.map((s) => s.name) },
        grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
        xAxis: {
          type: 'time',
          name: 'Date',
          nameLocation: 'middle',
          nameGap: 60,
          axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: { type: 'value', name: 'Views in Interval' },
        series,
      },
      { notMerge: true }
    );

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [slots]);

  useEffect(() => {
    return () => {
      cumulativeInstanceRef.current?.dispose();
      intervalInstanceRef.current?.dispose();
      correlationInstanceRef.current?.dispose();
      intervalBarInstanceRef.current?.dispose();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row flex-wrap gap-4">
        {slots.map((slot, index) => (
          <PostSearchBox
            key={slot.id}
            index={index}
            query={slot.query}
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
            className="shrink-0 px-4 py-2 rounded border border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
          >
            + Add post
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {derivativeStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {derivativeStats.map(({ slot, velocityStats, accelerationStats, growthStatus }, i) => (
            <div
              key={slot.id}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colorFor(i) }} />
                <h3 className="text-lg font-semibold text-gray-800">{slot.selected.label}</h3>
                {growthStatus && (
                  <span
                    className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${growthStatus.color}`}
                  >
                    {growthStatus.label}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                Chart buckets:
                <select
                  value={slot.aggregation}
                  onChange={(e) => handleAggregationChange(slot.id, e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-gray-700"
                >
                  <option value="raw">Raw</option>
                  <option value="1">Every 1 hour</option>
                  <option value="3">Every 3 hours</option>
                  <option value="12">Every 12 hours</option>
                  <option value="24">Every 24 hours</option>
                </select>
              </label>
              {velocityStats && accelerationStats ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <Stat
                    label="Peak Velocity"
                    value={`${Math.round(velocityStats.peak[1]).toLocaleString()} views/hr`}
                    sub={formatAxisDateTime(velocityStats.peak[0])}
                  />
                  <Stat
                    label="Current Velocity"
                    value={`${Math.round(velocityStats.current[1]).toLocaleString()} views/hr`}
                    sub="most recent interval"
                  />
                  <Stat
                    label="Peak Acceleration"
                    value={`+${Math.round(accelerationStats.peak[1]).toLocaleString()} views/hr²`}
                    sub={formatAxisDateTime(accelerationStats.peak[0])}
                  />
                  <Stat
                    label="Peak Deceleration"
                    value={`${Math.round(accelerationStats.trough[1]).toLocaleString()} views/hr²`}
                    sub={formatAxisDateTime(accelerationStats.trough[0])}
                  />
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Not enough data points to compute derivatives.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cumulative Views Comparison</h2>
        {hasSelection ? (
          <div ref={cumulativeChartRef} className="w-full h-[450px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Interval Comparison</h2>
        {hasSelection ? (
          <div ref={intervalChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>

      {visibleCatalystImpacts.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Catalyst Impact</h2>
          <p className="text-sm text-gray-400 mb-4">
            Whenever a post launched or spiked, here's what happened to the other selected posts'
            velocity in the following 24 hours.
          </p>
          <div className="space-y-3">
            {visibleCatalystImpacts.map((impact) => {
              const { verb, color } = describeCatalystImpact(impact.percentChange);
              return (
                <div
                  key={`${impact.affectedLabel}-${impact.catalystLabel}-${impact.catalystAt}`}
                  className="flex items-center justify-between text-sm border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
                >
                  <span className="text-gray-700">
                    <span className="font-semibold">{impact.catalystLabel}</span> {impact.reason},
                    and it <span className={`font-semibold ${color}`}>{verb}</span>{' '}
                    <span className="font-semibold">{possessive(impact.affectedLabel)}</span> velocity
                    — it went from {Math.round(impact.before).toLocaleString()} to{' '}
                    {Math.round(impact.after).toLocaleString()} views/hr in the following 24 hours
                    {impact.percentChange !== null && (
                      <>
                        {' '}
                        (<span className={color}>{Math.round(impact.percentChange)}%</span>)
                      </>
                    )}
                    , on {formatAxisDateTime(impact.catalystAt)}.
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCorrelationCard && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Velocity Correlation</h2>
          <p className="text-sm text-gray-400 mb-4">
            Do these posts' growth rates move together, restricted to the window where each pair
            was actually live at the same time.
          </p>
          {isLoadingSelections ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : activeSlots.length === 2 ? (
            <>
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">r = {primaryPair.overlap.correlation.toFixed(2)}</span>
                {' — '}
                {describeCorrelation(primaryPair.overlap.correlation)}
              </p>
              <div ref={correlationChartRef} className="w-full h-[350px]" />
            </>
          ) : (
            <div className="space-y-2">
              {meaningfulPairs
                .slice()
                .sort((a, b) => Math.abs(b.overlap.correlation) - Math.abs(a.overlap.correlation))
                .map((pair) => (
                  <div
                    key={pairKey(pair.labelA, pair.labelB)}
                    className="flex items-center justify-between text-sm border-t border-gray-100 pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="text-gray-700">
                      {pair.labelA} vs {pair.labelB}
                    </span>
                    <span className="font-semibold text-gray-800">
                      r = {pair.overlap.correlation.toFixed(2)} — {describeCorrelation(pair.overlap.correlation)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Interval (Bar Comparison)</h2>
        {hasSelection ? (
          <div ref={intervalBarChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>
    </div>
  );
}
