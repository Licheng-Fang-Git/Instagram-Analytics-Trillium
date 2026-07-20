'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { parseCsvRowsToSeries, resampleToFixedBuckets, formatAxisDateTime } from '@/lib/chartAggregation';

export default function MeetTheMentors({ data }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [aggregation, setAggregation] = useState('none');

  // Init + dispose are paired in this one mount-scoped effect, and the ref is
  // nulled on cleanup. Without nulling, a client-side navigation (or React's
  // dev double-mount) would leave the ref pointing at a disposed instance, and
  // the data effect below would call setOption on a dead chart — the "blank
  // until reload" bug.
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !data || !data.length) return;

    // "None" = original look: one point per CSV row, evenly spaced on a
    // category axis. "Raw" = one point per row too, but positioned by real
    // time. A number resamples onto fixed-size time buckets.
    const isNone = aggregation === 'none';
    const isDense = isNone || aggregation === 'raw';
    const parsed = parseCsvRowsToSeries(data);
    const { cumulative, interval } =
      aggregation === 'raw' || isNone
        ? parsed
        : resampleToFixedBuckets(parsed.cumulative, aggregation);

    const intervalStartLabels = data.map((row) => row['Interval Start']);
    const rawInterval = data.map((row) => row['Views in Interval']);
    const rawCumulative = data.map((row) => row['Cumulative Views']);

    const option = {
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['Views in Interval', 'Cumulative Views'],
        bottom: 0,
      },
      grid: {
        top: '20%',
        left: '5%',
        right: '5%',
        bottom: '18%',
        containLabel: true,
      },
      xAxis: isNone
        ? {
            type: 'category',
            data: intervalStartLabels,
            axisTick: { alignWithLabel: true },
            axisLabel: { rotate: 30 },
          }
        : {
            type: 'time',
            axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
          },
      yAxis: [
        {
          type: 'value',
          name: 'Views in Interval',
          position: 'left',
          axisLabel: { formatter: '{value}' },
        },
        {
          type: 'value',
          name: 'Cumulative Views',
          position: 'right',
        },
      ],
      series: [
        {
          name: 'Views in Interval',
          type: 'bar',
          data: isNone ? rawInterval : interval,
          itemStyle: { color: '#3b82f6' }, // Tailwind blue-500
          barMaxWidth: isDense ? 8 : 30,
        },
        {
          name: 'Cumulative Views',
          type: 'line',
          yAxisIndex: 1, // Uses the right hand Y-axis configuration
          data: isNone ? rawCumulative : cumulative,
          smooth: true,
          itemStyle: { color: '#10b981' }, // Tailwind emerald-500
          lineStyle: { width: 3 },
        },
      ],
    };

    // notMerge fully replaces the option so switching axis types leaves no
    // stale config behind.
    chart.setOption(option, { notMerge: true });
  }, [data, aggregation]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Financial & User Growth</h2>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Buckets:
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-gray-700"
          >
            <option value="none">None</option>
            <option value="raw">Raw</option>
            <option value="1">Every 1 hour</option>
            <option value="3">Every 3 hours</option>
            <option value="12">Every 12 hours</option>
            <option value="24">Every 24 hours</option>
          </select>
        </label>
      </div>

      {/* Target element initialized by ECharts hooks */}
      <div ref={chartRef} className="w-full h-[450px]" />
    </div>
  );
}
