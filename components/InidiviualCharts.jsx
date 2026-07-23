'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { normalizeRows, bucketByIntervalLength, formatAxisDateTime, BUCKET_OPTIONS } from '@/lib/chartAggregation';

export default function InidiviualCharts({ data }) {
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
    let raw_cumulative = [];
    let raw_interval = [];
    let timeEnds = [];
    let cumulative = [[]];
    let interval = [[]];

    if (bucket === 'none'){

      data.forEach((one_row) => {raw_cumulative.push(one_row['Cumulative Views']);
                                  raw_interval.push(one_row['Views in Interval']);
                                  const rawDateStr = one_row['Interval Start'];
                                  const timestamp = new Date(`${rawDateStr} ${ASSUMED_YEAR}`).getTime();
                                  timeEnds.push(formatAxisDateTime(timestamp))});

    }else{
      const rows = normalizeRows(data);
      const result = bucketByIntervalLength(rows, bucket);
      cumulative = result.cumulative;
      interval = result.interval;
    }


    chart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { data: ['Views in Interval', 'Cumulative Views'], 
                  bottom: 0,     
                  textStyle: {
                    color: '#dfdecc',
                    fontFamily: 'sans-serif'
                  }},
        grid: { top: '15%', left: '5%', right: '5%', bottom: '18%', containLabel: true },
        xAxis: {
          type: bucket === 'none' ? 'category' : 'time',
          data: bucket === 'none' ? timeEnds : undefined,
          nameTextStyle: {color:'dfdecc'},
          axisLabel: bucket === 'none' ? { color: '#a0a0a0', rotate:30 } : { formatter: formatAxisDateTime, rotate: 30 },
        },
        yAxis: [
          { type: 'value', name: 'Views in Interval', position: 'left', axisLabel: { color: '#dfdecc', formatter: '{value}' }, nameTextStyle:{color:'#dfdecc'} },
          { type: 'value', name: 'Cumulative Views', position: 'right', axisLabel : {color: '#dfdecc' }, nameTextStyle: {color:'dfdecc'}},
        ],
        series: [
          {
            name: 'Views in Interval',
            type: 'bar',
            data: bucket === 'none' ? raw_interval : interval,
            itemStyle: { color: '#eab308' },
            barMaxWidth: 24,
          },
          {
            name: 'Cumulative Views',
            type: 'line',
            yAxisIndex: 1,
            data: bucket === 'none' ? raw_cumulative : cumulative,
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
    <div className="bg-[#1c1c1c] text-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-medium tracking-wide text-[#dfdecc]">Financial & User Growth</h2>
        <label className="flex items-center gap-2 text-xs text-[#dfdecc]">
          Bucket size:
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-[#dfdecc] hover:border-[#ebffa8]"
          >
            {BUCKET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className='text-[#0d0d0d]'>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Target element initialized by ECharts hooks */}
      <div ref={chartRef} className="w-full h-[450px] " />
    </div>
  );
}
