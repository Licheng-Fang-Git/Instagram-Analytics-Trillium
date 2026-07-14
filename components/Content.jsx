'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function Content({ data }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    let organized_week_content = {};
    let organized_time_content = {};

    data.forEach((row) => {
        if(row.WeekDay in organized_week_content  ){ 
            organized_week_content[row.WeekDay][0] += row.Views;
            organized_week_content[row.WeekDay][1] += 1;
        }
        else{
            organized_week_content[row.WeekDay] = [row.Views,1];
        }
        if(row.Time in organized_time_content){
            organized_time_content[row.Time][0] += row.Views;
            organized_time_content[row.Time][1] += 1;
        }
        else{
            organized_time_content[row.Time] = [row.Views,1];
        }
    })
    console.log(organized_time_content)
    // 1. Extract and map columns out of your CSV data format
    const weekDay = Object.keys(organized_week_content);
    const times = Object.keys(organized_time_content);
    const weekDayViews = Object.entries(organized_week_content).map(([key, value]) => {
        console.log(key, value);
        return value[0]/value[1];
      });
    const timeDayViews = Object.entries(organized_time_content).map(([key, value]) => {
        return value[0]/value[1]
      });
    console.log(weekDayViews, timeDayViews)

    // 2. Initialize the ECharts instance attached to our DOM node
    const chartInstance = echarts.init(chartRef.current);

    // 3. Define the ECharts configuration layout
    const option = {
      xAxis: {
        type: 'category',
        data: weekDay
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          data: weekDayViews,
          type: 'bar'
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
    <div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Week Day</h2>
        <div ref={chartRef} className="w-full h-[450px]" />
      </div>

    
    </div>
  );
}