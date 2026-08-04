'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { getOverviewSeries, getAllPostImpact } from '@/app/compare/actions';
import { interpolateValue } from '@/lib/chartAggregation';
import { BRAND, brandTooltip, valueAxis, axisLabel, axisLine } from '@/lib/chartTheme';

const POST_LABELS = {
  interns2026: 'Meet the 2026 Interns',
  micon2026: 'Mic On',
  nasdaq2026: 'Nasdaq Times Square',
  mentors2026: 'Meet the Mentors',
  ditl2026: 'Intern Day Reel',
  misconceptions2026: 'Misconceptions Reel',
  cht2026: 'College Hot Takes',
  nid2026: 'National Intern Day',
  poker2026: 'Poker 2026',
};

const DAY = 86400000;
const WINDOW_DAYS = 3;

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}
function dayLabel(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dayFloor(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Least-squares slope (per day) of [t, v] points; t in ms.
function slope(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  const b = den ? num / den : 0;
  return { a: my - b * mx, b, perDay: b * DAY };
}

export default function PostImpact() {
  const chartRef = useRef(null);
  const instRef = useRef(null);
  const [series, setSeries] = useState(null);
  const [impact, setImpact] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getOverviewSeries().then(setSeries).catch(() => setSeries([]));
    getAllPostImpact().then(setImpact).catch(() => setImpact({}));
  }, []);

  const options = useMemo(() => {
    if (!impact) return [];
    return Object.entries(impact)
      .filter(([, m]) => m && Number.isFinite(m.postedAt))
      .map(([code, m]) => ({ code, label: POST_LABELS[code] || code, at: m.postedAt }))
      .sort((a, b) => a.at - b.at);
  }, [impact]);

  useEffect(() => {
    if (!selected && options.length) setSelected(options[options.length - 1].code);
  }, [options, selected]);

  // Cumulative account views over the full timeline (needed for the pre-window).
  const cum = useMemo(() => {
    if (!series?.length) return [];
    let run = 0;
    return series.map((r) => {
      run += r.views;
      return [r.t, run];
    });
  }, [series]);

  const cur = selected && impact ? impact[selected] : null;

  const analysis = useMemo(() => {
    if (!cum.length || !cur) return null;
    const at = cur.postedAt;
    const pre = cum.filter(([t]) => t >= at - WINDOW_DAYS * DAY && t <= at);
    const post = cum.filter(([t]) => t >= at && t <= at + WINDOW_DAYS * DAY);
    return { at, endAt: cur.endAt, pre: slope(pre), post: slope(post), postPts: post };
  }, [cum, cur]);

  useEffect(() => {
    if (!chartRef.current || !cum.length || !cur) return;
    if (!instRef.current) instRef.current = echarts.init(chartRef.current);
    const chart = instRef.current;

    const min = dayFloor(cur.postedAt);
    const max = cur.endAt;
    // Line runs from the post's publish day to its end day.
    const lineData = cum.filter(([t]) => t >= cur.postedAt && t <= cur.endAt);

    // A circle for every post whose publish time falls inside this window.
    const marks = options
      .filter((o) => o.at >= min && o.at <= max)
      .map((o) => ({
        name: o.label,
        code: o.code,
        coord: [o.at, interpolateValue(cum, o.at)],
        itemStyle: {
          color: o.code === selected ? '#ebffa8' : '#0d0d0d',
          borderColor: '#ebffa8',
          borderWidth: 1.6,
        },
      }));

    // The "post 3-day" slope segment, drawn on the line.
    const seg =
      analysis?.post && analysis.postPts.length >= 2
        ? [
            {
              type: 'line',
              silent: true,
              showSymbol: false,
              z: 5,
              data: [
                [analysis.postPts[0][0], analysis.post.a + analysis.post.b * analysis.postPts[0][0]],
                [
                  analysis.postPts[analysis.postPts.length - 1][0],
                  analysis.post.a + analysis.post.b * analysis.postPts[analysis.postPts.length - 1][0],
                ],
              ],
              lineStyle: { color: BRAND.accent, width: 3 },
              name: 'Post 3-day slope',
            },
          ]
        : [];

    chart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: brandTooltip,
        legend: {
          bottom: 0,
          data: ['Cumulative account views', 'Post 3-day slope'],
          textStyle: { color: BRAND.legend, fontFamily: BRAND.sans, fontSize: 12 },
          inactiveColor: '#4a4a4a',
        },
        grid: { top: 16, left: 8, right: 16, bottom: 44, containLabel: true },
        xAxis: {
          type: 'time',
          min,
          max,
          minInterval: DAY,
          axisLine,
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { ...axisLabel, formatter: dayLabel, rotate: 38, hideOverlap: true },
        },
        yAxis: valueAxis(),
        series: [
          {
            name: 'Cumulative account views',
            type: 'line',
            data: lineData,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2, color: BRAND.beige },
            itemStyle: { color: BRAND.beige },
            markPoint: {
              symbol: 'circle',
              symbolSize: 10,
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
          ...seg,
        ],
      },
      { notMerge: true }
    );

    const onClick = (params) => {
      if (params.componentType === 'markPoint' && params.data?.code) {
        setSelected(params.data.code);
      }
    };
    chart.on('click', onClick);
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      chart.off('click', onClick);
      window.removeEventListener('resize', onResize);
    };
  }, [cum, options, selected, analysis, cur]);

  useEffect(() => () => instRef.current?.dispose(), []);

  const pre = analysis?.pre?.perDay;
  const post = analysis?.post?.perDay;
  const delta =
    Number.isFinite(post) && Number.isFinite(pre) && pre !== 0 ? ((post - pre) / Math.abs(pre)) * 100 : null;

  const m = cur?.metrics;
  const metricRows = m
    ? [
        ['Views', m.views],
        ['Reach', m.reach],
        ['Likes', m.likes],
        ['Saves', m.saves],
        ['Shares', m.shares],
        ['Follows', m.follows],
        ['Comments', m.comments],
      ]
    : [];

  return (
    <div className="flex flex-col gap-4 border border-[#1f1f1f] bg-[#121212]">
      <div className="flex flex-wrap items-center gap-4 border-b border-[#1f1f1f] px-6 py-5">
        <h4 className="font-display text-[16px] font-semibold text-white">Analyze Post — growth impact</h4>
        <span className="text-xs text-[#67696f]">Click a point on the line to analyze that post</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]">Post</span>
          <select
            value={selected || ''}
            onChange={(e) => setSelected(e.target.value)}
            className="cursor-pointer rounded-full border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-2 font-mono text-[13px] text-white"
          >
            {options.map((o) => (
              <option key={o.code} value={o.code} className="text-[#0d0d0d]">
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Slope callouts */}
      <div className="grid grid-cols-1 gap-4 px-6 sm:grid-cols-3">
        <div className="flex flex-col gap-1 border-l-2 border-[#787878] pl-3">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]">
            Pre 3-day slope
          </span>
          <span className="font-mono text-[20px] text-white">
            {Number.isFinite(pre) ? `${pre >= 0 ? '+' : ''}${fmt(pre)}/day` : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-1 border-l-2 border-[#ebffa8] pl-3">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]">
            Post 3-day slope
          </span>
          <span className="font-mono text-[20px] text-white">
            {Number.isFinite(post) ? `${post >= 0 ? '+' : ''}${fmt(post)}/day` : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-1 border-l-2 border-[#2a2a2a] pl-3">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]">
            Change in pace
          </span>
          <span
            className="font-mono text-[20px]"
            style={{ color: delta == null ? '#787878' : delta >= 0 ? BRAND.accent : '#ff6549' }}
          >
            {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`}
          </span>
        </div>
      </div>

      <div className="px-6 pt-2">
        {cum.length && cur ? (
          <div ref={chartRef} className="h-[420px] w-full" />
        ) : (
          <p className="py-16 text-center text-sm text-[#67696f]">Loading account timeline…</p>
        )}
      </div>

      {/* Metrics for the selected / clicked post */}
      {m && (
        <div className="border-t border-[#1f1f1f] px-6 py-5">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-[14px] font-semibold text-white">{POST_LABELS[selected] || selected}</span>
            <span className="font-mono text-[11px] text-[#67696f]">{selected}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            {metricRows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between border-b border-[#191919] py-1.5">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]">
                  {label}
                </span>
                <span className="font-mono text-[14px] text-white">{fmt(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
