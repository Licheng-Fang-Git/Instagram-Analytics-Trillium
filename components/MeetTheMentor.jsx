'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function MeetTheMentors({ data }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    // 1. Extract and map columns out of your CSV data format
    const interval_start = data.map((row) => row['Interval Start']);
    const views_in_interval = data.map((row) => row['Views in Interval']);
    const cumulative_views = data.map((row) => row['Cumulative Views']);
    
    console.log(cumulative_views); // Log the extracted data to verify its structure
    // 2. Initialize the ECharts instance attached to our DOM node
    const chartInstance = echarts.init(chartRef.current);

    // 3. Define the ECharts configuration layout
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['Views in Interval', 'Cumulative Views'],
        bottom: 0
      },
      grid: {
        top: '20%',
        left: '5%',
        right: '5%',
        bottom: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: interval_start,
        axisTick: { alignWithLabel: true }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Views in Interval',
          position: 'left',
          axisLabel: { formatter: '{value}' }
        },
        {
          type: 'value',
          name: 'Cumulative Views',
          position: 'right'
        }
      ],
      series: [
        {
          name: 'Views in Interval',
          type: 'bar',
          data: views_in_interval,
          itemStyle: { color: '#3b82f6' }, // Tailwind blue-500
          barWidth: '40%'
        },
        {
          name: 'Cumulative Views',
          type: 'line',
          yAxisIndex: 1, // Uses the right hand Y-axis configuration
          data: cumulative_views,
          smooth: true,
          itemStyle: { color: '#10b981' }, // Tailwind emerald-500
          lineStyle: { width: 3 }
        }
      ]
    };

    chartInstance.setOption(option);

    // 4. Clean window resize listener to keep charts responsive
    const handleResize = () => chartInstance.resize();
    window.addEventListener('resize', handleResize);

    // 5. Cleanup on component unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.dispose();
    };
  }, [data]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Financial & User Growth</h2>
      
      {/* Target element initialized by ECharts hooks */}
      <div ref={chartRef} className="w-full h-[450px]" />
    </div>
  );
}