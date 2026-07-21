// Shared time-series helpers used by both the per-post pages and the
// compare page: turning raw CSV/Sheet rows into [timestamp, value] pairs,
// interpolating a value at an arbitrary timestamp, resampling onto
// fixed-size buckets (every 1/3/12/24 hours), and formatting axis labels
// consistently everywhere.

// Every timestamp in these CSVs omits the year, so we assume 2026 (the year
// this dataset was collected) purely so `Date` can parse them.
const ASSUMED_YEAR = 2026;

// Converts parsed CSV/Sheet rows (with "Interval Start"/"Interval End",
// "Views in Interval", and "Cumulative Views" columns) into the
// [timestamp, value] pair series every chart and helper here works with.
export function parseCsvRowsToSeries(rows) {
  if (!rows || !rows.length) return { cumulative: [], interval: [] };

  const originMs = new Date(`${rows[0]['Interval Start']} ${ASSUMED_YEAR}`).getTime();
  const cumulative = [[originMs, 0]];
  const interval = [];

  rows.forEach((row) => {
    const endMs = new Date(`${row['Interval End']} ${ASSUMED_YEAR}`).getTime();
    const cumulativeViews = row['Cumulative Views'] ?? row['Culmulative Views'];
    cumulative.push([endMs, cumulativeViews]);
    interval.push([endMs, row['Views in Interval']]);
  });

  return { cumulative, interval };
}

// Linear interpolation so a value can be read at any arbitrary timestamp,
// even one that falls between two real data points.
export function interpolateValue(points, t) {
  if (t <= points[0][0]) return points[0][1];
  if (t >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 1; i < points.length; i++) {
    const [t0, v0] = points[i - 1];
    const [t1, v1] = points[i];
    if (t <= t1) {
      if (t1 === t0) return v1;
      const ratio = (t - t0) / (t1 - t0);
      return v0 + ratio * (v1 - v0);
    }
  }
  return points[points.length - 1][1];
}

// Resamples a cumulative series onto fixed-size buckets (in hours) — e.g.
// every 1/3/12/24 hours — instead of the CSV's own ragged intervals (15
// minutes right after posting, ballooning to 24 hours later on). Derives
// both the aggregated cumulative curve (the interpolated value at each
// bucket edge) and the aggregated interval curve (the difference between
// consecutive edges) from that same interpolation, so the two always stay
// consistent with each other regardless of the original bucketing.
export function resampleToFixedBuckets(cumulativePoints, bucketHours) {
  const bucketMs = Number(bucketHours) * 60 * 60 * 1000;
  const start = cumulativePoints[0][0];
  const end = cumulativePoints[cumulativePoints.length - 1][0];

  const cumulative = [];
  const interval = [];
  let previousValue = 0;
  for (let t = start; t < end; t += bucketMs) {
    const value = interpolateValue(cumulativePoints, t);
    cumulative.push([t, value]);
    interval.push([t, value - previousValue]);
    previousValue = value;
  }

  const finalValue = cumulativePoints[cumulativePoints.length - 1][1];
  cumulative.push([end, finalValue]);
  interval.push([end, finalValue - previousValue]);

  return { cumulative, interval };
}

// Duration in minutes for each "Interval Length" string the sheets use.
// (Google Sheets formats durations >= 24h as h:mm:ss, hence "24:00:00".)
const INTERVAL_MINUTES = {
  '0:15': 15,
  '0:30': 30,
  '1:00': 60,
  '3:00': 180,
  '6:00': 360,
  '12:00': 720,
  '24:00:00': 1440,
};

// The bucket sizes offered to the user. Each maps to the native "Interval
// Length" string that marks where the data's own granularity reaches that
// size — that's where re-bucketing stops.
export const BUCKET_OPTIONS = [
  { value: '0:15', label: '15 minutes' },
  { value: '0:30', label: '30 minutes' },
  { value: '1:00', label: '1 hour' },
  { value: '6:00', label: '6 hours' },
  { value: '24:00:00', label: '24 hours' },
];

// Normalizes parsed CSV/Sheet rows into a compact chronological array of
// { tEnd, intervalLength, views, cumulative }.
export function normalizeRows(rows) {
  if (!rows || !rows.length) return [];
  return rows.map((row) => ({
    tEnd: new Date(`${row['Interval End']} ${ASSUMED_YEAR}`).getTime(),
    intervalLength: String(row['Interval Length'] ?? '').trim(),
    views: row['Views in Interval'],
    cumulative: row['Cumulative Views'] ?? row['Culmulative Views'],
  }));
}

// Re-tiles the fine-grained start of the timeline into uniform buckets of the
// chosen size by summing "Views in Interval" across consecutive rows. It only
// walks up to (and including) the last row whose native Interval Length equals
// the target — rows after that are already coarser than the bucket, so there's
// nothing to combine. A bucket closes once the accumulated real elapsed time
// reaches the target size. Because the data is sorted fine -> coarse and each
// native size divides the next, the rows tile evenly into target-size buckets.
// The cumulative value for each bucket is the real recorded cumulative at the
// bucket's final row (exact, not summed), so it stays accurate.
export function bucketByIntervalLength(rows, targetValue) {
  const targetMinutes = INTERVAL_MINUTES[targetValue];
  if (!targetMinutes || !rows.length) return { cumulative: [], interval: [] };

  let lastIdx = -1;
  rows.forEach((r, i) => {
    if (r.intervalLength === targetValue) lastIdx = i;
  });
  if (lastIdx === -1) return { cumulative: [], interval: [] };

  const cumulative = [];
  const interval = [];
  let accViews = 0;
  let accMinutes = 0;
  let lastRow = null;
  for (let i = 0; i <= lastIdx; i++) {
    const r = rows[i];
    accViews += r.views;
    accMinutes += INTERVAL_MINUTES[r.intervalLength] ?? 0;
    lastRow = r;
    if (accMinutes >= targetMinutes) {
      interval.push([r.tEnd, accViews]);
      cumulative.push([r.tEnd, r.cumulative]);
      accViews = 0;
      accMinutes = 0;
    }
  }
  // Safety net: if the final rows didn't fill a whole bucket (shouldn't happen
  // with the standard data, which tiles evenly), keep the partial bucket so no
  // views are silently dropped.
  if (accMinutes > 0 && lastRow) {
    interval.push([lastRow.tEnd, accViews]);
    cumulative.push([lastRow.tEnd, lastRow.cumulative]);
  }

  return { cumulative, interval };
}

// Matches the "Thu Jun 25 12:04 PM" style timestamps already used across the app.
export function formatAxisDateTime(value) {
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
