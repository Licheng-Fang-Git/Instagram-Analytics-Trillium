'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSeries } from '@/app/compare/actions';

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
      lineStyle: { width: 3 },
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
        yAxis: { type: 'value', name: 'Cumulative Views' },
        series,
      },
      { notMerge: true }
    );

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [slots]);

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
      lineStyle: { width: 2 },
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
    if (!intervalBarChartRef.current) return;
    if (!intervalBarInstanceRef.current) {
      intervalBarInstanceRef.current = echarts.init(intervalBarChartRef.current);
    }
    const chart = intervalBarInstanceRef.current;

    const series = activeSlots.map((slot, i) => ({
      name: slot.selected.label,
      type: 'bar',
      barMaxWidth: 6,
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
