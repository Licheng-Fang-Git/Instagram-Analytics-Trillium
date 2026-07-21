'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { normalizeRows, bucketByIntervalLength, formatAxisDateTime, BUCKET_OPTIONS } from '@/lib/chartAggregation';

export default function InternDayReel({ data }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [bucket, setBucket] = useState('1:00');

  // Init + dispose paired in one mount-scoped effect, nulling the ref on
  // cleanup so a client-side navigation re-initializes cleanly.
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    // Resize when the container itself gets/changes size — covers the case
    // where the chart initializes before the flex layout has settled its width.
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

    const rows = normalizeRows(data);
    const { cumulative, interval } = bucketByIntervalLength(rows, bucket);

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { data: ['Views in Interval', 'Cumulative Views'], bottom: 0 },
        grid: { top: '15%', left: '5%', right: '5%', bottom: '18%', containLabel: true },
        xAxis: {
          type: 'time',
          axisLabel: { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: [
          { type: 'value', name: 'Views in Interval', position: 'left', axisLabel: { formatter: '{value}' } },
          { type: 'value', name: 'Cumulative Views', position: 'right' },
        ],
        series: [
          {
            name: 'Views in Interval',
            type: 'bar',
            data: interval,
            itemStyle: { color: '#3b82f6' },
            barMaxWidth: 24,
          },
          {
            name: 'Cumulative Views',
            type: 'line',
            yAxisIndex: 1,
            data: cumulative,
            smooth: true,
            symbolSize: 5,
            itemStyle: { color: '#10b981' },
            lineStyle: { width: 3 },
          },
        ],
      },
      { notMerge: true }
    );
  }, [data, bucket]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Financial & User Growth</h2>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Bucket size:
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-gray-700"
          >
            {BUCKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Target element initialized by ECharts hooks */}
      <div ref={chartRef} className="w-full h-[450px]" />
    </div>
  );
}
