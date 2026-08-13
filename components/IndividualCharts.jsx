'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { normalizeRows, bucketByIntervalLength, formatAxisDateTime, formatAxisDateTimeShort, parseTs, BUCKET_OPTIONS } from '@/lib/chartAggregation';
import { BRAND, brandTooltip, valueAxis, axisLabel, axisLine } from '@/lib/chartTheme';

// Shorten a full "Thu Jun 25 12:04 PM" category label to "Jun 25 12p" for the
// axis, while the category data itself stays full for the hover tooltip.
function shortCat(full) {
  const p = String(full).split(' ');
  if (p.length < 5) return full;
  return `${p[1]} ${p[2]} ${p[3].split(':')[0]}${p[4][0].toLowerCase()}`;
}

const DAY_MS = 86400000;

// A day-only axis label ("Jun 25").
function dayLabel(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Snap a timestamp to local midnight. The 24h buckets end at the post's
// time-of-day (e.g. 1:43 PM), which sits ~15h off the day-axis ticks — snapping
// them to their day lines the bars/points up with the day labels.
function dayFloor(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Human-readable label for each native "Interval Length" the sheets use.
const INTERVAL_LABELS = {
  '0:15': '15 min',
  '0:30': '30 min',
  '1:00': '1 hour',
  '3:00': '3 hours',
  '6:00': '6 hours',
  '12:00': '12 hours',
  '24:00': '24 hours',
  '24:00:00': '24 hours',
};

// Group consecutive rows that share the same native interval length (the data is
// sorted fine → coarse, so each granularity is one contiguous block). Returns
// { startIdx, endIdx, label } per group — used to draw the x-axis brackets.
function intervalGroups(rows) {
  const groups = [];
  rows.forEach((row, i) => {
    const raw = String(row['Interval Length'] ?? '').trim();
    const label = INTERVAL_LABELS[raw] || raw || '—';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.endIdx = i;
    else groups.push({ startIdx: i, endIdx: i, label });
  });
  return groups;
}

export default function IndividualCharts({ data }) {
  const ASSUMED_YEAR = 2026;
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [bucket, setBucket] = useState('none');

  // Init + dispose paired in one mount-scoped effect, nulling the ref on
  // cleanup so a client-side navigation re-initializes cleanly.
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !data || !data.length) return;
    let raw_cumulative = [];
    let raw_interval = [];
    let timeEnds = [];
    let cumulative = [[]];
    let interval = [[]];

    // The 24h buckets end at the post's time-of-day; snap them to the day so
    // the bars/points sit on the day-axis ticks.
    const dayBucket = bucket === '24:00:00';

    // For the None bucket, the raw rows change granularity over time (15m → 30m →
    // … → 24h); group them so we can bracket each granularity under the x-axis.
    const groups = bucket === 'none' ? intervalGroups(data) : [];

    if (bucket === 'none') {
      data.forEach((one_row) => {
        raw_cumulative.push(one_row['Cumulative Views']);
        raw_interval.push(one_row['Views in Interval']);
        // Label by Interval END, matching the bucketed views and the cumulative
        // point (which is the value as of the interval's close) — so the same
        // row lands on the same date in every bucket size.
        timeEnds.push(formatAxisDateTime(parseTs(one_row['Interval End'])));
      });
    } else {
      const rows = normalizeRows(data);
      const result = bucketByIntervalLength(rows, bucket);
      const snap = (pts) => (dayBucket ? pts.map(([t, v]) => [dayFloor(t), v]) : pts);
      cumulative = snap(result.cumulative);
      interval = snap(result.interval);
    }

    chart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: brandTooltip,
        grid: { top: 40, left: 20, right: 18, bottom: bucket === 'none' ? 58 : 24, containLabel: true },
        xAxis: {
          type: bucket === 'none' ? 'category' : 'time',
          data: bucket === 'none' ? timeEnds : undefined,
          ...(dayBucket ? { minInterval: DAY_MS, maxInterval: DAY_MS } : {}),
          axisLine,
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel:
            bucket === 'none'
              ? { ...axisLabel, rotate: 38, hideOverlap: true, interval: 'auto', formatter: shortCat }
              : dayBucket
                ? { ...axisLabel, formatter: dayLabel, rotate: 38, hideOverlap: true }
                : { ...axisLabel, formatter: formatAxisDateTimeShort, rotate: 38, hideOverlap: true },
        },
        yAxis: [
          {
            type: 'value',
            name: 'Views in Time Interval',
            position: 'left',
            nameLocation: 'end',
            nameGap: 14,
            axisLabel: { color: BRAND.white, formatter: '{value}' },
            // align:'left' anchors the title at the axis line so it extends
            // rightward into the plot instead of overflowing the left edge.
            nameTextStyle: { color: BRAND.white, align: 'left' },
          },
          {
            type: 'value',
            name: 'Cumulative Views',
            position: 'right',
            nameLocation: 'end',
            nameGap: 14,
            axisLabel: { color: BRAND.white },
            nameTextStyle: { color: BRAND.white, align: 'right' },
          },
        ],
        series: [
          {
            name: 'Views in Interval',
            type: 'bar',
            data: bucket === 'none' ? raw_interval : interval,
            itemStyle: { color: BRAND.accent, opacity: 0.85 },
            barMaxWidth: 24,
          },
          {
            name: 'Cumulative Views',
            type: 'line',
            yAxisIndex: 1,
            data: bucket === 'none' ? raw_cumulative : cumulative,
            smooth: true,
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: { color: "#00d1ae" },
            lineStyle: { width: 2, color: "#00d1ae" },
          },
          // Brackets under the x-axis grouping each interval granularity
          // (15 min → 30 min → … → 24 hours). None bucket only.
          ...(bucket === 'none'
            ? [
                {
                  type: 'custom',
                  silent: true,
                  z: 6,
                  data: groups.map(() => 0),
                  renderItem: (params, api) => {
                    const g = groups[params.dataIndex];
                    if (!g) return null;
                    const step = Math.abs(api.coord([1, 0])[0] - api.coord([0, 0])[0]) || 8;
                    const x0 = api.coord([g.startIdx, 0])[0] - step / 2 + 2;
                    const x1 = api.coord([g.endIdx, 0])[0] + step / 2 - 2;
                    const y = api.getHeight() - 30; // band in the bottom margin, below the axis labels
                    const tick = 5;
                    const stroke = '#7a7a7a';
                    return {
                      type: 'group',
                      silent: true,
                      children: [
                        { type: 'line', shape: { x1: x0, y1: y, x2: x1, y2: y }, style: { stroke, lineWidth: 1 } },
                        { type: 'line', shape: { x1: x0, y1: y - tick, x2: x0, y2: y }, style: { stroke, lineWidth: 1 } },
                        { type: 'line', shape: { x1: x1, y1: y - tick, x2: x1, y2: y }, style: { stroke, lineWidth: 1 } },
                        {
                          type: 'text',
                          style: {
                            text: g.label,
                            x: (x0 + x1) / 2,
                            y: y + 3,
                            textAlign: 'center',
                            textVerticalAlign: 'top',
                            fill: '#d0d0d0',
                            font: `10px ${BRAND.sans}`,
                          },
                        },
                      ],
                    };
                  },
                },
              ]
            : []),
        ],
      },
      { notMerge: true }
    );
  }, [data, bucket]);

  return (
    <div className="border border-[#232323] bg-black">
      <div className="flex items-center justify-between border-b border-[#1f1f1f] px-6 py-5">
        <h4 className="font-display text-[16px] font-semibold text-white">View Growth</h4>
        <label className="flex items-center gap-2.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
            Bucket size
          </span>
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="border border-[#2a2a2a] bg-[#0d0d0d] px-2.5 py-1.5 text-[13px] text-white"
          >
            {BUCKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="text-[#FFFFFF]">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="px-6 pb-3 pt-5">
        <div ref={chartRef} className="h-[460px] w-full" />
      </div>

      <div className="flex gap-6 px-6 pb-5 font-display text-[11px] uppercase tracking-[0.06em] text-[#cfcfcf]">
        <span className="flex items-center gap-2">
          <span className="block h-2.5 w-3.5 bg-[#ebffa8]" />
          Views in interval
        </span>
        <span className="flex items-center gap-2">
          <span className="block h-0.5 w-3.5 bg-[#d9d4cb]" />
          Cumulative views
        </span>
      </div>
    </div>
  );
}
