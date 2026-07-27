'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { interpolateValue } from '@/lib/chartAggregation';
import { getAllPostDates } from '@/app/compare/actions';
import { BRAND, brandTooltip, valueAxis, axisLabel, axisLine } from '@/lib/chartTheme';

// Post code -> friendly label, so a marker's hover tooltip names the post.
const POST_LABELS = {
  ditl2026: 'Intern Day Reel',
  interns2026: 'Meet the 2026 Interns',
  mentors2026: 'Meet the Mentors',
  micon2026: 'Mic On',
  nasdaq2026: 'Nasdaq Times Square',
  misconceptions2026: 'Misconceptions Reel',
  cht2026: 'College Hot Takes',
};

// Each metric gets its own card + mini chart, colored from the brand palette.
// `def` is the Instagram-style definition shown on hover over the metric name.
const METRICS = [
  {
    key: 'Views',
    title: 'Views',
    color: BRAND.accent,
    def: 'Total number of times your content has been played or displayed on Instagram.',
  },
  {
    key: 'Reach',
    title: 'Reach',
    color: BRAND.beige,
    def: 'Number of unique Instagram accounts that have seen your content at least once.',
  },
  {
    key: 'Content interactions',
    title: 'Content Interactions',
    color: BRAND.white,
    def: 'Total number of likes, saves, comments, and shares across your content.',
  },
  {
    key: 'Visits',
    title: 'Visits',
    color: BRAND.white,
    def: 'The number of times your profile was visited.',
  },
  {
    key: 'Follows',
    title: 'Follows',
    color: BRAND.accent,
    def: 'The number of accounts that started following you during this period.',
  },
];

function dateToMs(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function formatDay(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCompact(n) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function MetricChart({ title, metricKey, rows, postMarks, color, def }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  const total = rows.reduce((sum, r) => sum + (Number(r[metricKey]) || 0), 0);

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
        backgroundColor: 'transparent',
        tooltip: brandTooltip,
        grid: { top: 12, left: 8, right: 12, bottom: 44, containLabel: true },
        xAxis: {
          type: 'time',
          axisLabel: { ...axisLabel, formatter: formatDay, rotate: 38 },
          axisLine,
          axisTick: { show: false },
          splitLine: { show: false },
        },
        yAxis: valueAxis({ splitNumber: 4 }),
        series: [
          {
            name: title,
            type: 'line',
            data: points,
            smooth: true,
            showSymbol: false,
            itemStyle: { color },
            lineStyle: { width: 2, color },
            areaStyle: { color, opacity: 0.1 },
            markPoint: {
              symbol: 'circle',
              symbolSize: 7,
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
              data: marks,
            },
          },
        ],
      },
      { notMerge: true }
    );
  }, [rows, postMarks, metricKey, title, color]);

  return (
    <div className="flex flex-col gap-1 border border-[#1f1f1f] bg-[#121212] px-6 pb-4 pt-6">
      <div className="flex items-baseline justify-between">
        <span className="group relative inline-flex cursor-help items-center gap-1 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#787878] underline decoration-dotted decoration-[#4a4a4a] underline-offset-4 transition-colors hover:text-[#e8e8e8]">
          {title}
          {def && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 border border-[#2a2a2a] bg-black px-3 py-2 font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-[#cfcfcf] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            >
              {def}
            </span>
          )}
        </span>
      </div>
      <div className="font-serif text-[44px] leading-[1.1] text-white">{formatCompact(total)}</div>
      <div ref={chartRef} className="mt-2 h-[220px] w-full" />
    </div>
  );
}

export default function OverviewCharts({ data }) {
  const [allPostDates, setAllPostDates] = useState(null);

  const rows = Array.isArray(data) ? data.filter((r) => r && r['Date']) : [];
  const minDate = rows.length ? rows.reduce((a, r) => (r['Date'] < a ? r['Date'] : a), rows[0]['Date']) : '';
  const maxDate = rows.length ? rows.reduce((a, r) => (r['Date'] > a ? r['Date'] : a), rows[0]['Date']) : '';

  const [start, setStart] = useState(minDate);
  const [end, setEnd] = useState(maxDate);
  const [preset, setPreset] = useState('All');

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

  function applyPreset(days, key) {
    setPreset(key);
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

  const rangeNote =
    preset === 'All'
      ? `${filteredRows.length} days · full export`
      : `Last ${preset.replace('d', ' days')}`;

  const RANGES = [
    { key: '7d', label: '7d', days: 7 },
    { key: '28d', label: '28d', days: 28 },
    { key: 'All', label: 'All', days: null },
  ];

  const dateInputStyle = {
    background: '#0d0d0d',
    border: '1px solid #2a2a2a',
    color: '#ffffff',
    colorScheme: 'dark',
    fontFamily: 'var(--ff-mono)',
    fontSize: '13px',
    padding: '8px 12px',
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border border-[#1f1f1f] bg-[#121212] px-5 py-4">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#d9d4cb]">From</span>
        <input
          type="date"
          value={start}
          min={minDate}
          max={end}
          onChange={(e) => {
            setStart(e.target.value);
            setPreset('custom');
          }}
          style={dateInputStyle}
        />
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#d9d4cb]">To</span>
        <input
          type="date"
          value={end}
          min={start}
          max={maxDate}
          onChange={(e) => {
            setEnd(e.target.value);
            setPreset('custom');
          }}
          style={dateInputStyle}
        />
        <div className="ml-2 flex gap-2">
          {RANGES.map((r) => {
            const active = preset === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => applyPreset(r.days, r.key)}
                className={`border px-4 py-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200 ${
                  active
                    ? 'border-[#ebffa8] bg-[#ebffa8] text-[#0d0d0d]'
                    : 'border-[#2a2a2a] bg-transparent text-[#e8e8e8] hover:border-[#ebffa8] hover:bg-[#ebffa8] hover:text-[#0d0d0d]'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto font-mono text-xs text-[#d9d4cb]">{rangeNote}</div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {METRICS.map((m) => (
          <MetricChart
            key={m.key}
            title={m.title}
            metricKey={m.key}
            rows={filteredRows}
            postMarks={postMarks}
            color={m.color}
            def={m.def}
          />
        ))}
      </div>
    </div>
  );
}
