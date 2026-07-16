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
  const activeSlots = slots.filter((slot) => slot.selected && slot.series);

  const derivativeStats = activeSlots.map((slot) => {
    const { velocity, acceleration } = computeDerivatives(slot.series.cumulative);
    return {
      slot,
      velocityStats: summarizeSeries(velocity),
      accelerationStats: summarizeSeries(acceleration),
    };
  });

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
          {derivativeStats.map(({ slot, velocityStats, accelerationStats }, i) => (
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
