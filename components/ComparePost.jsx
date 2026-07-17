'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSeries, getAllPostDates } from '@/app/compare/actions';

const POST_OPTIONS = [
  { code: 'ditl2026', label: 'Intern Day Reel' },
  { code: 'interns2026', label: 'Meet the 2026 Interns' },
  { code: 'mentors2026', label: 'Meet the Mentors' },
  { code: 'micon2026', label: 'Mic On' },
  { code: 'nasdaq2026', label: 'Nasdaq Times Square' },
];

const LINE_COLORS = ['#3b82f6', '#f97316'];

// Matches the "Thu Jun 25 12:04 PM" style timestamps already used elsewhere in the app.
function formatAxisDateTime(value) {
  const d = new Date(value);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${weekday} ${month} ${day} ${hours}:${minutes} ${ampm}`;
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

// Linear interpolation so a cross-post mark can sit ON this line even when
// the other post's timestamp falls between two of this post's own data points.
function interpolateValue(points, t) {
  if (t <= points[0][0]) return points[0][1];
  if (t >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t <= t1) {
      if (t1 === t0) return v1;
      const ratio = (t - t0) / (t1 - t0);
      return v0 + ratio * (v1 - v0);
    }
  }
  return points[points.length - 1][1];
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

// "Did B's launch help or hurt A?" — for each pair where one post was already
// live when the other went up, compare the live post's velocity in the 24h
// before vs the 24h after the launch.
function computeCatalystImpacts(activeSlots) {
  if (activeSlots.length < 2) return [];
  const WINDOW_HOURS = 24;
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  const impacts = [];

  const [a, b] = activeSlots;
  [
    { affected: a, catalyst: b },
    { affected: b, catalyst: a },
  ].forEach(({ affected, catalyst }) => {
    const ownPoints = affected.series.cumulative;
    const ownStart = ownPoints[0][0];
    const ownEnd = ownPoints[ownPoints.length - 1][0];
    const catalystPostedAt = catalyst.series.cumulative[0][0];

    if (catalystPostedAt <= ownStart || catalystPostedAt > ownEnd) return;

    const { velocity } = computeDerivatives(ownPoints);
    if (velocity.length < 2) return;

    const before = averageVelocityInWindow(velocity, catalystPostedAt - windowMs, catalystPostedAt);
    const after = averageVelocityInWindow(velocity, catalystPostedAt, catalystPostedAt + windowMs);
    const percentChange = before > 0 ? ((after - before) / before) * 100 : null;

    impacts.push({
      affectedLabel: affected.selected.label,
      catalystLabel: catalyst.selected.label,
      catalystAt: catalystPostedAt,
      before,
      after,
      percentChange,
    });
  });

  return impacts;
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

function PostSearchBox({ index, query, onQueryChange, onSelect, excludeCode, isSelected }) {
  const [open, setOpen] = useState(false);

  const matches = POST_OPTIONS.filter(
    (opt) =>
      opt.code !== excludeCode &&
      opt.code.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative w-full">
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

const EMPTY_SLOT = { query: '', selected: null, series: null };

export default function ComparePost() {
  const cumulativeChartRef = useRef(null);
  const cumulativeInstanceRef = useRef(null);
  const intervalChartRef = useRef(null);
  const intervalInstanceRef = useRef(null);
  const correlationChartRef = useRef(null);
  const correlationInstanceRef = useRef(null);
  const intervalBarChartRef = useRef(null);
  const intervalBarInstanceRef = useRef(null);

  const [slots, setSlots] = useState([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
  const [error, setError] = useState(null);
  const [allPostDates, setAllPostDates] = useState(null);

  useEffect(() => {
    getAllPostDates().then(setAllPostDates).catch(() => setAllPostDates({}));
  }, []);

  function handleQueryChange(index, value) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], query: value };
      return next;
    });
  }

  async function handleSelect(index, opt) {
    setError(null);
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { query: opt.code, selected: opt, series: null };
      return next;
    });

    try {
      const series = await getPostSeries(opt.code);
      setSlots((prev) => {
        // Bail out if the user picked something else while this was loading.
        if (prev[index].selected?.code !== opt.code) return prev;
        const next = [...prev];
        next[index] = { ...next[index], series };
        return next;
      });
    } catch (err) {
      setError(`Couldn't load data for ${opt.code}.`);
    }
  }

  const hasSelection = slots.some((slot) => slot.selected);
  // Stable across the load: true as soon as both boxes have a post *chosen*,
  // even before their data has fetched. Used to keep chart containers mounted
  // continuously — unlike activeSlots below, which briefly drops out a slot
  // every time its data is (re)loading.
  const bothSelected = Boolean(slots[0].selected) && Boolean(slots[1].selected);
  const activeSlots = slots.filter((slot) => slot.selected && slot.series);

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
  const velocityOverlap =
    activeSlots.length === 2 ? computeVelocityOverlap(activeSlots[0], activeSlots[1]) : null;
  // "Little to no correlation" (|r| < 0.2, same threshold as describeCorrelation)
  // isn't worth showing — including the case where there's no overlap at all
  // (velocityOverlap null, r effectively undefined). Catalyst Impact rides on
  // the same gate: if the two posts' velocities don't move together at all,
  // a single 24h before/after snapshot isn't a trustworthy signal either.
  const hasMeaningfulCorrelation =
    velocityOverlap !== null &&
    velocityOverlap.correlation !== null &&
    Math.abs(velocityOverlap.correlation) >= 0.2;
  const showCorrelationCard = bothSelected && (activeSlots.length < 2 || hasMeaningfulCorrelation);

  useEffect(() => {
    if (!cumulativeChartRef.current) return;
    if (!cumulativeInstanceRef.current) {
      cumulativeInstanceRef.current = echarts.init(cumulativeChartRef.current);
    }
    const chart = cumulativeInstanceRef.current;

    const series = activeSlots.map((slot, i) => ({
      name: slot.selected.label,
      type: 'line',
      showSymbol: false,
      smooth: true,
      data: slot.series.cumulative,
      lineStyle: { width: 5 },
      itemStyle: { color: LINE_COLORS[i] },
      markPoint: {
        symbol: 'circle',
        symbolSize: 14,
        itemStyle: { color: 'transparent', borderColor: LINE_COLORS[i], borderWidth: 2 },
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
        data: getCrossPostMarks(slot, allPostDates, slot.series.cumulative),
      },
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

    const series = activeSlots.map((slot, i) => ({
      name: slot.selected.label,
      type: 'line',
      showSymbol: false,
      smooth: true,
      data: slot.series.interval,
      lineStyle: { width: 3 },
      itemStyle: { color: LINE_COLORS[i] },
      markPoint: {
        symbol: 'circle',
        symbolSize: 14,
        itemStyle: { color: 'transparent', borderColor: LINE_COLORS[i], borderWidth: 2 },
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
        data: getCrossPostMarks(slot, allPostDates, slot.series.interval),
      },
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
    // This card can now hide/reappear based on the correlation strength, so
    // its container can genuinely unmount and remount — if the previous
    // instance's DOM node is no longer in the document, it's stale; dispose
    // it before creating a fresh one instead of drawing onto a detached node.
    if (correlationInstanceRef.current && !correlationInstanceRef.current.getDom()?.isConnected) {
      correlationInstanceRef.current.dispose();
      correlationInstanceRef.current = null;
    }
    if (!correlationInstanceRef.current) {
      correlationInstanceRef.current = echarts.init(correlationChartRef.current);
    }
    const chart = correlationInstanceRef.current;

    const series = velocityOverlap
      ? [
          {
            name: activeSlots[0].selected.label,
            type: 'line',
            showSymbol: false,
            smooth: true,
            data: velocityOverlap.seriesA,
            lineStyle: { width: 3 },
            itemStyle: { color: LINE_COLORS[0] },
          },
          {
            name: activeSlots[1].selected.label,
            type: 'line',
            showSymbol: false,
            smooth: true,
            data: velocityOverlap.seriesB,
            lineStyle: { width: 3 },
            itemStyle: { color: LINE_COLORS[1] },
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
      data: slot.series.interval,
      itemStyle: { color: LINE_COLORS[i] },
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
      <div className="flex flex-col sm:flex-row gap-4">
        <PostSearchBox
          index={0}
          query={slots[0].query}
          onQueryChange={(v) => handleQueryChange(0, v)}
          onSelect={(opt) => handleSelect(0, opt)}
          excludeCode={slots[1].selected?.code}
          isSelected={Boolean(slots[0].selected)}
        />
        <PostSearchBox
          index={1}
          query={slots[1].query}
          onQueryChange={(v) => handleQueryChange(1, v)}
          onSelect={(opt) => handleSelect(1, opt)}
          excludeCode={slots[0].selected?.code}
          isSelected={Boolean(slots[1].selected)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {derivativeStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {derivativeStats.map(({ slot, velocityStats, accelerationStats, growthStatus }, i) => (
            <div
              key={slot.selected.code}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[i] }}
                />
                <h3 className="text-lg font-semibold text-gray-800">{slot.selected.label}</h3>
                {growthStatus && (
                  <span
                    className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${growthStatus.color}`}
                  >
                    {growthStatus.label}
                  </span>
                )}
              </div>
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

      {catalystImpacts.length > 0 && hasMeaningfulCorrelation && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Catalyst Impact</h2>
          <div className="space-y-3">
            {catalystImpacts.map((impact) => {
              const { verb, color } = describeCatalystImpact(impact.percentChange);
              return (
                <div
                  key={`${impact.affectedLabel}-${impact.catalystLabel}`}
                  className="flex items-center justify-between text-sm border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
                >
                  <span className="text-gray-700">
                    <span className="font-semibold">{impact.catalystLabel}</span>'s launch{' '}
                    <span className={`font-semibold ${color}`}>{verb}</span>{' '}
                    <span className="font-semibold">{impact.affectedLabel}</span>'s velocity — it
                    went from {Math.round(impact.before).toLocaleString()} to{' '}
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cumulative Views Comparison</h2>
        {hasSelection ? (
          <div ref={cumulativeChartRef} className="w-full h-[450px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select one or two posts above to compare.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Interval Comparison</h2>
        {hasSelection ? (
          <div ref={intervalChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select one or two posts above to compare.</p>
        )}
      </div>

      {showCorrelationCard && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Velocity Correlation</h2>
          <p className="text-sm text-gray-400 mb-4">
            Do the two posts' growth rates move together, restricted to the window where both were
            actually live at the same time.
          </p>
          {activeSlots.length < 2 ? (
            <p className="text-gray-400 text-sm mb-3">Loading...</p>
          ) : (
            <p className="text-sm text-gray-700 mb-3">
              <span className="font-semibold">r = {velocityOverlap.correlation.toFixed(2)}</span>
              {' — '}
              {describeCorrelation(velocityOverlap.correlation)}
            </p>
          )}
          <div ref={correlationChartRef} className="w-full h-[350px]" />
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Interval (Bar Comparison)</h2>
        {hasSelection ? (
          <div ref={intervalBarChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select one or two posts above to compare.</p>
        )}
      </div>
    </div>
  );
}
