'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { interpolateValue } from '@/lib/chartAggregation';
import { getAllPostDates } from '@/app/compare/actions';

// Post code -> friendly label, so a marker's hover tooltip names the post.
const POST_LABELS = {
  ditl2026: 'Intern Day Reel',
  interns2026: 'Meet the 2026 Interns',
  mentors2026: 'Meet the Mentors',
  micon2026: 'Mic On',
  nasdaq2026: 'Nasdaq Times Square',
  misconceptions2026: 'Misconceptions Reel',
  cht2026: "College Hot Takes"
};

// The five metrics, each its own chart. Colors are just for the line/markers.
const METRICS = [
  { key: 'Views', title: 'Views', color: '#3b82f6' },
  { key: 'Reach', title: 'Reach', color: '#10b981' },
  { key: 'Content interactions', title: 'Content interactions', color: '#8b5cf6' },
  { key: 'Visits', title: 'Visits', color: '#f97316' },
  { key: 'Follows', title: 'Follows', color: '#ef4444' },
];

// Overview "Date" values are ISO like "2026-06-01"; parse at local midnight so
// they line up with the post timestamps (also local) on the time axis.
function dateToMs(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function formatDay(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// 7623 -> "7.6K", 1_200_000 -> "1.2M", 172 -> "172".
function formatCompact(n) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function MetricChart({ title, metricKey, rows, postMarks, color }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  const total = rows.reduce((sum, r) => sum + (Number(r[metricKey]) || 0), 0);

  // Init + dispose paired, ref nulled on cleanup, plus a ResizeObserver so the
  // chart sizes correctly even if the flex/grid layout settles after init.
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    instanceRef.current = chart;

    const onClick = (params) => {
      if (params.componentType === 'markPoint' && params.data?.link) {
        window.open(params.data.link, '_blank', 'noopener,noreferrer');
      }
    };
    chart.on('click', onClick);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      chart.off('click', onClick);
      chart.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    const points = rows.map((r) => [dateToMs(r['Date']), Number(r[metricKey]) || 0]);

    // A circle for every post whose date falls inside the visible range,
    // sitting on the line at the interpolated value for that day.
    const marks =
      points.length > 0
        ? postMarks
            .filter((m) => m.at >= points[0][0] && m.at <= points[points.length - 1][0])
            .map((m) => ({
              name: m.label,
              link: m.link,
              coord: [m.at, interpolateValue(points, m.at)],
              cursor: m.link ? 'pointer' : 'default',
            }))
        : [];

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        grid: { top: '8%', left: '3%', right: '4%', bottom: '18%', containLabel: true },
        xAxis: {
          type: 'time',
          axisLabel: { formatter: formatDay, rotate: 30 },
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: title,
            type: 'line',
            data: points,
            smooth: true,
            showSymbol: false,
            itemStyle: { color },
            lineStyle: { width: 3 },
            markPoint: {
              symbol: 'circle',
              symbolSize: 8,
              itemStyle: { color: 'transparent', borderColor: color, borderWidth: 2 },
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
              data: marks,
            },
          },
        ],
      },
      { notMerge: true }
    );
  }, [rows, postMarks, metricKey, title, color]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
      <p className="text-3xl font-bold text-gray-900 mb-2">{formatCompact(total)}</p>
      <div ref={chartRef} className="w-full h-[300px]" />
    </div>
  );
}

export default function OverviewCharts({ data }) {
  const [allPostDates, setAllPostDates] = useState(null);

  const rows = Array.isArray(data) ? data.filter((r) => r && r['Date']) : [];
  const allMs = rows.map((r) => dateToMs(r['Date']));
  const minDate = rows.length ? rows.reduce((a, r) => (r['Date'] < a ? r['Date'] : a), rows[0]['Date']) : '';
  const maxDate = rows.length ? rows.reduce((a, r) => (r['Date'] > a ? r['Date'] : a), rows[0]['Date']) : '';

  const [start, setStart] = useState(minDate);
  const [end, setEnd] = useState(maxDate);

  useEffect(() => {
    getAllPostDates().then(setAllPostDates).catch(() => setAllPostDates({}));
  }, []);

  const startMs = start ? dateToMs(start) : -Infinity;
  const endMs = end ? dateToMs(end) : Infinity;
  const filteredRows = rows.filter((r) => {
    const t = dateToMs(r['Date']);
    return t >= startMs && t <= endMs;
  });

  const postMarks = allPostDates
    ? Object.entries(allPostDates).map(([code, meta]) => ({
        label: POST_LABELS[code] ?? code,
        at: meta.postedAt,
        link: meta.link,
      }))
    : [];

  // Preset that sets the start to `days` before the latest date.
  function applyPreset(days) {
    if (!maxDate) return;
    if (days === null) {
      setStart(minDate);
      setEnd(maxDate);
      return;
    }
    const from = new Date(`${maxDate}T00:00:00`);
    from.setDate(from.getDate() - (days - 1));
    const iso = from.toISOString().slice(0, 10);
    setStart(iso < minDate ? minDate : iso);
    setEnd(maxDate);
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1 text-gray-600">
          From
          <input
            type="date"
            value={start}
            min={minDate}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="border border-[#0d0d0d] rounded px-2 py-1 hover:border-[#3e84ff]"
          />
        </label>
        <label className="flex items-center gap-1 text-gray-600">
          To
          <input
            type="date"
            value={end}
            min={start}
            max={maxDate}
            onChange={(e) => setEnd(e.target.value)}
            className="border border-[#0d0d0d] rounded px-2 py-1 hover:border-[#3e84ff]"
          />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => applyPreset(7)} className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600">
            7d
          </button>
          <button type="button" onClick={() => applyPreset(28)} className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600">
            28d
          </button>
          <button type="button" onClick={() => applyPreset(null)} className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600">
            All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {METRICS.map((m) => (
          <MetricChart
            key={m.key}
            title={m.title}
            metricKey={m.key}
            rows={filteredRows}
            postMarks={postMarks}
            color={m.color}
          />
        ))}
      </div>
    </div>
  );
}
