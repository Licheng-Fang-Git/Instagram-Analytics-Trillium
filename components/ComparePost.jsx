'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getPostSeries, getAllPostDates } from '@/app/compare/actions';
import { interpolateValue, formatAxisDateTime, bucketByIntervalLength, BUCKET_OPTIONS } from '@/lib/chartAggregation';

const POST_OPTIONS = [
  { code: 'ditl2026', label: 'Intern Day Reel' },
  { code: 'interns2026', label: 'Meet the 2026 Interns' },
  { code: 'mentors2026', label: 'Meet the Mentors' },
  { code: 'micon2026', label: 'Mic On' },
  { code: 'nasdaq2026', label: 'Nasdaq Times Square' },
  { code: 'misconceptions2026', label: 'Misconceptions Reel' },
  { code: 'cht2026', label: 'College Hot Takes' },
];

const LINE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function colorFor(i) {
  return LINE_COLORS[i % LINE_COLORS.length];
}

// The series a post's charts should draw for the chosen bucket. "None" means
// no bucketing — plot every raw row as-is. Unlike the single-post pages
// (which use a category axis for "None"), the compare charts stay on the
// shared time axis so multiple posts with different timelines still line up,
// so raw rows become [timestamp, value] points here.
function seriesForBucket(rows, bucket) {
  if (bucket === 'none') {
    return {
      cumulative: rows.map((r) => [r.tEnd, r.cumulative]),
      interval: rows.map((r) => [r.tEnd, r.views]),
    };
  }
  return bucketByIntervalLength(rows, bucket);
}

// For a given post's line, find every OTHER post (from the full catalog, not
// just the other selected slot) that went up after this one's first shown
// point and before its last — those are the "X was posted here" markers.
// `ownPoints` is whichever (already filtered) series the mark should sit on.
function getCrossPostMarks(slot, allPostDates, ownPoints) {
  if (!allPostDates || !ownPoints.length) return [];
  const ownStart = ownPoints[0][0];
  const ownEnd = ownPoints[ownPoints.length - 1][0];

  return POST_OPTIONS.filter((opt) => opt.code !== slot.selected.code)
    .map((opt) => ({ opt, meta: allPostDates[opt.code] }))
    .filter(({ meta }) => meta && meta.postedAt > ownStart && meta.postedAt <= ownEnd)
    .map(({ opt, meta }) => ({
      name: opt.label,
      link: meta.link,
      coord: [meta.postedAt, interpolateValue(ownPoints, meta.postedAt)],
      cursor: meta.link ? 'pointer' : 'default',
    }));
}

const MARK_POINT = (color) => ({
  symbol: 'circle',
  symbolSize: 6,
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
});

function PostSearchBox({ index, query, onQueryChange, onSelect, excludeCodes, isSelected, onRemove, canRemove }) {
  const [open, setOpen] = useState(false);

  const matches = POST_OPTIONS.filter(
    (opt) =>
      !excludeCodes.includes(opt.code) &&
      opt.code.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={query}
          placeholder={`Search post ${index + 1}... (e.g. nasdaq2026)`}
          className={`w-full border border-[#1c1c1c] rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            isSelected ? 'text-black font-bold' : 'text-gray-700 font-normal'
          }`}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {canRemove && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            className="shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none px-1"
            aria-label={`Remove post ${index + 1}`}
          >
            ×
          </button>
        )}
      </div>
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
  const nextSlotId = useRef(2);

  const [slots, setSlots] = useState([
    { id: 0, ...EMPTY_SLOT },
    { id: 1, ...EMPTY_SLOT },
  ]);
  const [error, setError] = useState(null);
  const [allPostDates, setAllPostDates] = useState(null);
  const [bucket, setBucket] = useState('none');

  useEffect(() => {
    getAllPostDates().then(setAllPostDates).catch(() => setAllPostDates({}));
  }, []);

  function addSlot() {
    setSlots((prev) => {
      if (prev.length >= POST_OPTIONS.length) return prev;
      const id = nextSlotId.current++;
      return [...prev, { id, ...EMPTY_SLOT }];
    });
  }

  function removeSlot(index) {
    setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleQueryChange(index, value) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], query: value };
      return next;
    });
  }

  async function handleSelect(index, opt) {
    setError(null);
    const slotId = slots[index]?.id;
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], query: opt.code, selected: opt, series: null };
      return next;
    });

    try {
      const series = await getPostSeries(opt.code);
      setSlots((prev) => {
        // Bail out if this slot was removed or changed to something else
        // while the fetch was in flight.
        const idx = prev.findIndex((s) => s.id === slotId);
        if (idx === -1 || prev[idx].selected?.code !== opt.code) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], series };
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

    const series = activeSlots.map((slot, i) => {
      const filtered = seriesForBucket(slot.series.rows, bucket);
      return {
        name: slot.selected.label,
        type: 'line',
        showSymbol: false                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ,
        smooth: true,
        data: filtered.cumulative,
        lineStyle: { width: 3 },
        itemStyle: { color: colorFor(i) },
        markPoint: {
          ...MARK_POINT(colorFor(i)),
          data: getCrossPostMarks(slot, allPostDates, filtered.cumulative),
        },
      };
    });

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
        series
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
    if (!intervalChartRef.current) return;
    if (!intervalInstanceRef.current) {
      intervalInstanceRef.current = echarts.init(intervalChartRef.current);
    }
    const chart = intervalInstanceRef.current;

    const series = activeSlots.map((slot, i) => {
      const filtered = seriesForBucket(slot.series.rows, bucket);
      return {
        name: slot.selected.label,
        type: 'line',
        showSymbol: false,
        smooth: true,
        data: filtered.interval,
        lineStyle: { width: 3 },
        itemStyle: { color: colorFor(i) },
        markPoint: {
          ...MARK_POINT(colorFor(i)),
          data: getCrossPostMarks(slot, allPostDates, filtered.interval),
        },
      };
    });

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
    if (!intervalBarChartRef.current) return;
    if (!intervalBarInstanceRef.current) {
      intervalBarInstanceRef.current = echarts.init(intervalBarChartRef.current);
    }
    const chart = intervalBarInstanceRef.current;

    const series = activeSlots.map((slot, i) => ({
      name: slot.selected.label,
      type: 'bar',
      barMaxWidth: 12,
      data: seriesForBucket(slot.series.rows, bucket).interval,
      itemStyle: { color: colorFor(i) },
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
  }, [slots, bucket]);

  useEffect(() => {
    return () => {
      cumulativeInstanceRef.current?.dispose();
      intervalInstanceRef.current?.dispose();
      intervalBarInstanceRef.current?.dispose();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row flex-wrap gap-4">
        {slots.map((slot, index) => (
          <PostSearchBox
            key={slot.id}
            index={index}
            query={slot.query}
            onQueryChange={(v) => handleQueryChange(index, v)}
            onSelect={(opt) => handleSelect(index, opt)}
            excludeCodes={slots
              .filter((_, i) => i !== index)
              .map((s) => s.selected?.code)
              .filter(Boolean)}
            isSelected={Boolean(slot.selected)}
            onRemove={() => removeSlot(index)}
            canRemove={slots.length > 1}
          />
        ))}
        {slots.length < POST_OPTIONS.length && (
          <button
            type="button"
            onClick={addSlot}
            className="shrink-0 px-4 py-2 rounded border border-solid border-[#FFFFFF] bg-[#0D0D0D] text-sm text-[#FFFFFF] hover:bg-[#EBFFA8] hover:text-[#0D0D0D] hover:border-[#0D0D0D]"
          >
            + Add post
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {hasSelection && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">Bucket size:</span>
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
          <span className="text-gray-400 text-xs">
            combines rows into buckets of this size, up to where the data's own granularity reaches it
          </span>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cumulative Views Comparison</h2>
        {hasSelection ? (
          <div ref={cumulativeChartRef} className="w-full h-[450px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Views per Interval Comparison</h2>
        {hasSelection ? (
          <div ref={intervalChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Reaction per Interval (Bar Comparison)</h2>
        {hasSelection ? (
          <div ref={intervalBarChartRef} className="w-full h-[400px]" />
        ) : (
          <p className="text-gray-400 text-sm">Select posts above to compare.</p>
        )}
      </div>
    </div>
  );
}
