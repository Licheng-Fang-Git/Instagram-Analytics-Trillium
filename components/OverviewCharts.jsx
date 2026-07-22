'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { normalizeRows, bucketByIntervalLength, formatAxisDateTime, BUCKET_OPTIONS } from '@/lib/chartAggregation';
import { getPostSeries, getAllPostDates } from '@/app/compare/actions';

const EMPTY_SLOT = { query: '', selected: null, series: null };

export default function OverviewCharts({ data }) {
    const ASSUMED_YEAR = 2026;
    const viewsChartRef = useRef(null);
    const viewsInstanceRef = useRef(null);
    const reachChartRef = useRef(null);
    const reachInstanceRef = useRef(null);
    const interactionChartRef = useRef(null);
    const interactionInstanceRef = useRef(null);
    const visitsChartRef = useRef(null);
    const visitsInstanceRef = useRef(null);
    const followsChartRef = useRef(null);
    const followsInstanceRef = useRef(null);
    const [bucket, setBucket] = useState('none');
    const [allPostDates, setAllPostDates] = useState(null);
    const [slots, setSlots] = useState([
        { id: 0, ...EMPTY_SLOT },
        { id: 1, ...EMPTY_SLOT },
      ]);

    useEffect(() => {
        getAllPostDates().then(setAllPostDates).catch(() => setAllPostDates({}));
    }, []);

    useEffect(() => {
        if (!viewsChartRef.current) return;
        if (!viewsInstanceRef.current) {
          viewsInstanceRef.current = echarts.init(viewsChartRef.current);
        }
        const chart = viewsInstanceRef.current;
        let views = [];
        let time = [];
        data.forEach((row) => {views.push(row['Views']); 
                                time.push(row['Date']);})
        console.log(views, time);
    
        // const series = activeSlots.map((slot, i) => {
        //   const filtered = seriesForBucket(slot.series.rows, bucket);
        //   return {
        //     name: slot.selected.label,
        //     type: 'line',
        //     showSymbol: false,
        //     smooth: true,
        //     data: filtered.cumulative,
        //     lineStyle: { width: 3 },
        //     itemStyle: { color: colorFor(i) },
        //     markPoint: {
        //       ...MARK_POINT(colorFor(i)),
        //       data: getCrossPostMarks(slot, allPostDates, filtered.cumulative),
        //     },
        //   };
        // });
    
        chart.setOption(
          {
            tooltip: { trigger: 'axis' },
            // legend: { bottom: 0, data: series.map((s) => s.name) },
            grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
            xAxis: {
              type: 'category',
              data: time,
              axisLabel: { rotate: 30 },
            },
            yAxis:[ { type: 'value', name: 'Views', position: 'right', axisLabel: { formatter: '{value}' }}],
            series: [
                {
                    name: 'Views',
                    type: 'line',
                    data: views,
                    smooth: true,
                    symbolSize: 5,
                    itemStyle: { color: '#10b981' },
                    lineStyle: { width: 3 },
                }],
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
      }, [slots, allPostDates, bucket]);

      useEffect(() => {
        if (!reachChartRef.current) return;
        if (!reachInstanceRef.current) {
          reachInstanceRef.current = echarts.init(reachChartRef.current);
        }
        const chart = reachInstanceRef.current;
        let reachs = [];
        let time = [];
        data.forEach((row) => {reachs.push(row['Reach']); 
                                time.push(row['Date']);})

    
        // const series = activeSlots.map((slot, i) => {
        //   const filtered = seriesForBucket(slot.series.rows, bucket);
        //   return {
        //     name: slot.selected.label,
        //     type: 'line',
        //     showSymbol: false,
        //     smooth: true,
        //     data: filtered.cumulative,
        //     lineStyle: { width: 3 },
        //     itemStyle: { color: colorFor(i) },
        //     markPoint: {
        //       ...MARK_POINT(colorFor(i)),
        //       data: getCrossPostMarks(slot, allPostDates, filtered.cumulative),
        //     },
        //   };
        // });
    
        chart.setOption(
          {
            tooltip: { trigger: 'axis' },
            // legend: { bottom: 0, data: series.map((s) => s.name) },
            grid: { top: '10%', left: '5%', right: '5%', bottom: '22%', containLabel: true },
            xAxis: {
              type: 'category',
              data: time,
              axisLabel: { rotate: 30 },
            },
            yAxis:[ { type: 'value', name: 'Reach', position: 'right', axisLabel: { formatter: '{value}' }}],
            series: [
                {
                    name: 'Reach',
                    type: 'line',
                    data: reachs,
                    smooth: true,
                    symbolSize: 5,
                    itemStyle: { color: '#10b981' },
                    lineStyle: { width: 3 },
                }],
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
      }, [slots, allPostDates, bucket]);

    return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Financial & User Growth</h2>
        </div>

        {/* Target element initialized by ECharts hooks */}
        <div ref={viewsChartRef} className="w-full h-[450px]" />
        <div ref={reachChartRef} className="w-full h-[450px]" />

    </div>
    );
}
