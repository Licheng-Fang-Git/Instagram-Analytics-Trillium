'use client';

import { useMemo, useState } from 'react';
import { BRAND } from '@/lib/chartTheme';
import { normalizeRows, bucketByIntervalLength, formatAxisDateTime, BUCKET_OPTIONS } from '@/lib/chartAggregation';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MINUTES = 24 * 60;

const POST_TITLES = {
  interns2026: 'Meet the 2026 Interns',
  micon2026: 'Mic On',
  nasdaq2026: 'Nasdaq Times Square',
  mentors2026: 'Meet the Mentors',
  ditl2026: 'Intern Day Reel',
  misconceptions2026: 'Misconceptions Reel',
  cht2026: 'College Hot Takes',
};
// Order the dropdown to match the sidebar grouping (June posts, then July).
const POST_ORDER = ['interns2026', 'micon2026', 'nasdaq2026', 'mentors2026', 'ditl2026', 'misconceptions2026', 'cht2026'];

// The bucket controls both the x-axis resolution and which native
// Interval Length rows the data is re-tiled from (see buildGrid). `iv` is the
// sheet's Interval Length key that bucketByIntervalLength stops at.
const BUCKETS = [
  { label: '15 min', min: 15, iv: '0:15' },
  { label: '30 min', min: 30, iv: '0:30' },
  { label: '1 hour', min: 60, iv: '1:00' },
  { label: '6 hours', min: 360, iv: '6:00' },
  { label: '24 hours', min: 1440, iv: '24:00:00' },
];

function compact(n) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.round(n));
}
function hour12(h) {
  return h % 12 === 0 ? 12 : h % 12;
}
// A clock label for a minute-of-day offset (e.g. 570 -> "9:30AM", 780 -> "1PM").
function timeLabel(min) {
  const total = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hr = Math.floor(total / 60);
  const m = total % 60;
  const ap = hr < 12 ? 'AM' : 'PM';
  return m === 0 ? `${hour12(hr)}${ap}` : `${hour12(hr)}:${String(m).padStart(2, '0')}${ap}`;
}
function windowLabel(di, col, bucketMin) {
  if (bucketMin >= DAY_MINUTES) return `${DAYS[di]} · All day`;
  const start = col * bucketMin;
  return `${DAYS[di]} · ${timeLabel(start)}–${timeLabel(start + bucketMin)}`;
}

// Build the 7 x N (day-of-week x time-of-day) grid.
//
// For each post we re-tile its rows into `iv`-sized buckets using the data's
// own Interval Length column (bucketByIntervalLength): consecutive fine rows
// are summed up to the target size, stopping at the last row of that native
// granularity — e.g. "1 hour" combines the 15/30-min rows up through the last
// 1:00 row. Each resulting bucket (a `bucketMin`-long window ending at tEnd) is
// then placed on the grid by the clock time its window started.
function buildGrid(seriesByCode, codes, iv, bucketMin) {
  const cols = Math.round(DAY_MINUTES / bucketMin);
  const bucketMs = bucketMin * 60 * 1000;
  const grid = Array.from({ length: 7 }, () => new Array(cols).fill(0));

  for (const code of codes) {
    const rows = seriesByCode[code] || [];
    if (!rows.length) continue;
    const { interval } = bucketByIntervalLength(rows, iv); // [[tEnd, views], ...]
    for (const [tEnd, v] of interval) {
      if (!Number.isFinite(tEnd) || !v) continue;
      const d = new Date(tEnd - bucketMs); // window start
      const minutesIntoDay = d.getHours() * 60 + d.getMinutes();
      const col = Math.min(cols - 1, Math.max(0, Math.floor(minutesIntoDay / bucketMin)));
      const di = (d.getDay() + 6) % 7; // shift so Monday = 0
      grid[di][col] += v;
    }
  }
  return grid;
}

function Heatmap({ grid, max, cols, bucketMin }) {
  const w = 1160;
  const cell = 34;
  const gap = cols > 48 ? 1 : cols > 24 ? 2 : 3;
  const left = 54;
  const top = 26;
  const h = top + 7 * cell + 6;
  const cw = (w - left - 8 - gap * (cols - 1)) / cols;

  // Label roughly every 3 hours; positions land on hour boundaries.
  const labelStep = Math.max(1, Math.round(180 / bucketMin));
  const showHourLabels = bucketMin < DAY_MINUTES;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="auto" style={{ display: 'block' }}>
      {showHourLabels &&
        Array.from({ length: cols }, (_, c) => c)
          .filter((c) => c % labelStep === 0)
          .map((c) => {
            const hr = Math.floor((c * bucketMin) / 60);
            return (
              <text
                key={`h${c}`}
                x={left + c * (cw + gap)}
                y={top - 10}
                fill="#ffffff"
                fontSize="11"
                fontFamily="ui-monospace, Menlo, monospace"
              >
                {hour12(hr)}{hr < 12 ? 'a' : 'p'}
              </text>
            );
          })}
      {grid.map((row, di) => (
        <g key={`r${di}`}>
          <text
            x={left - 12}
            y={top + di * cell + cell / 2 + 4}
            textAnchor="end"
            fill="#e8e8e8"
            fontSize="11"
            fontFamily="Montserrat, sans-serif"
            letterSpacing="0.08em"
          >
            {DAYS[di].toUpperCase()}
          </text>
          {row.map((v, col) => {
            const t = max > 0 ? v / max : 0;
            const dim = t < 0.06;
            const peak = max > 0 && v === max;
            return (
              <rect
                key={`c${di}-${col}`}
                x={left + col * (cw + gap)}
                y={top + di * cell}
                width={cw}
                height={cell - gap}
                fill={dim ? '#141414' : BRAND.accent}
                fillOpacity={dim ? 1 : 0.12 + t * 0.88}
                stroke={peak ? '#ffffff' : 'none'}
                strokeWidth={peak ? 1.5 : 0}
              >
                <title>{`${windowLabel(di, col, bucketMin)} — ${compact(v)} views`}</title>
              </rect>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export default function BestTimeToPost({ series }) {
  const [selected, setSelected] = useState('all');
  const [bucketMin, setBucketMin] = useState(60);

  const codes = POST_ORDER.filter((c) => series[c]);
  const cols = Math.round(DAY_MINUTES / bucketMin);
  const iv = (BUCKETS.find((b) => b.min === bucketMin) || BUCKETS[2]).iv;

  const grid = useMemo(() => {
    // Re-tile per post (each post's tiling is relative to its own publish
    // time), then merge onto one grid — never concatenate rows across posts.
    const codesToUse =
      selected === 'all' ? POST_ORDER.filter((c) => series[c]) : series[selected] ? [selected] : [];
    return buildGrid(series, codesToUse, iv, bucketMin);
  }, [selected, series, bucketMin, iv]);

  const stats = useMemo(() => {
    const flat = [];
    grid.forEach((row, di) => row.forEach((v, col) => flat.push({ di, col, v })));
    const sorted = flat.filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
    const max = sorted.length ? sorted[0].v : 0;
    const peak = sorted[0] || null;
    const quietest = sorted.length ? sorted[sorted.length - 1] : null;

    const dayTotals = grid.map((row, di) => ({ di, total: row.reduce((a, b) => a + b, 0) }));
    const dayMax = Math.max(1, ...dayTotals.map((d) => d.total));
    const bestDay = [...dayTotals].sort((a, b) => b.total - a.total)[0];

    return { sorted, max, peak, quietest, dayTotals, dayMax, bestDay };
  }, [grid]);

  const { max, peak, quietest, sorted, dayTotals, dayMax, bestDay } = stats;
  const ratio = peak && quietest && quietest.v > 0 ? Math.round(peak.v / quietest.v) : null;

  const calloutCard = 'flex flex-col gap-1.5 border border-[#1f1f1f] bg-[#121212] px-6 py-[22px]';
  const callouts = [
    {
      label: 'Peak window',
      value: peak ? windowLabel(peak.di, peak.col, bucketMin).split(' · ')[1] : '—',
      note: peak
        ? `${DAYS[peak.di]} — ${compact(peak.v)} views${ratio ? `, ${ratio}× the quietest window` : ''}`
        : 'No data',
      accent: BRAND.accent,
    },
    {
      label: 'Best day',
      value: bestDay && bestDay.total > 0 ? DAYS[bestDay.di] : '—',
      note: 'Highest total interval views across the selection',
      accent: BRAND.beige,
    },
    {
      label: 'Avoid',
      value: quietest ? windowLabel(quietest.di, quietest.col, bucketMin).split(' · ')[1] : '—',
      note: quietest ? `${DAYS[quietest.di]} — ${compact(quietest.v)} views on average` : 'No data',
      accent: '#2a2a2a',
    },
  ];

  const legendSteps = [0.12, 0.32, 0.52, 0.74, 1];

  return (
    <div className="flex flex-col gap-7">
      {/* Callouts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {callouts.map((c) => (
          <div key={c.label} className={calloutCard} style={{ borderTop: `3px solid ${c.accent}` }}>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
              {c.label}
            </span>
            <span className="font-serif text-[34px] leading-[1.05] text-white">{c.value}</span>
     
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="border border-[#1f1f1f] bg-[#121212]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[#1f1f1f] px-6 py-5">
          <h4 className="font-display text-[16px] font-semibold text-white">Views by Day &amp; Hour</h4>

          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
              Bucket
            </span>
            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((b) => {
                const active = bucketMin === b.min;
                return (
                  <button
                    key={b.min}
                    type="button"
                    onClick={() => setBucketMin(b.min)}
                    className={`border px-3 py-1.5 font-mono text-xs transition-all ${
                      active
                        ? 'border-[#ebffa8] bg-[#1f1f1f] text-[#ebffa8]'
                        : 'border-[#2a2a2a] bg-transparent text-[#e8e8e8] hover:border-[rgba(235,255,168,0.35)] hover:text-[#ebffa8]'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6e6e6]">
              Post
            </span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="cursor-pointer rounded-full border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-2 font-mono text-[13px] text-white"
            >
              <option value="all" className="text-[#FFFFFF]">
                All posts (aggregated)
              </option>
              {codes.map((c) => (
                <option key={c} value={c} className="text-[#FFFFFF]">
                  {POST_TITLES[c] || c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#e6e6e6]">low</span>
            <span className="flex">
              {legendSteps.map((o, i) => (
                <span key={i} className="block h-2.5 w-[22px]" style={{ background: BRAND.accent, opacity: o }} />
              ))}
            </span>
            <span className="font-mono text-[11px] text-[#e6e6e6]">high</span>
          </div>
        </div>
        <div className="overflow-x-auto px-6 pb-6 pt-5">
          <div style={{ minWidth: Math.max(720, cols * 14) }}>
            <Heatmap grid={grid} max={max} cols={cols} bucketMin={bucketMin} />
          </div>
        </div>
      </div>

      {/* Top Windows + Day of Week */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="border border-[#232323] bg-black">
          <div className="border-b border-[#1f1f1f] px-6 py-5">
            <h4 className="font-display text-[16px] font-semibold text-white">Top Windows</h4>
          </div>
          {sorted.slice(0, 6).map((c, i) => (
            <div
              key={`${c.di}-${c.col}`}
              className="grid grid-cols-[24px_minmax(0,1fr)_74px_minmax(0,80px)] items-center gap-3 border-b border-[#161616] px-6 py-3.5"
            >
              <span className="font-mono text-xs text-[#e6e6e6]">{String(i + 1).padStart(2, '0')}</span>
              <span className="whitespace-nowrap text-sm text-white">{windowLabel(c.di, c.col, bucketMin)}</span>
              <span className="text-right font-mono text-[13px] text-white">{compact(c.v)}</span>
              <span className="block h-1.5 bg-[#1f1f1f]">
                <span
                  className="block h-full bg-[#ebffa8]"
                  style={{ width: `${max > 0 ? (c.v / max) * 100 : 0}%` }}
                />
              </span>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-[#e6e6e6]">No data for this selection.</p>
          )}
        </div>

        <div className="border border-[#1f1f1f] bg-[#121212]">
          <div className="border-b border-[#1f1f1f] px-6 py-5">
            <h4 className="font-display text-[16px] font-semibold text-white">Day of Week</h4>
          </div>
          {dayTotals.map((d) => (
            <div
              key={d.di}
              className="grid grid-cols-[52px_minmax(0,1fr)_74px] items-center gap-3 border-b border-[#191919] px-6 py-[13px]"
            >
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[#e8e8e8]">
                {DAYS[d.di]}
              </span>
              <span className="block h-2 bg-[#1f1f1f]">
                <span
                  className="block h-full"
                  style={{
                    width: `${(d.total / dayMax) * 100}%`,
                    background: d.total === dayMax && d.total > 0 ? BRAND.accent : BRAND.beige,
                  }}
                />
              </span>
              <span className="text-right font-mono text-[13px] text-white">{compact(d.total / cols)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
