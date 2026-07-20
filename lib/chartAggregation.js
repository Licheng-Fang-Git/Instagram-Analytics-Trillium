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
