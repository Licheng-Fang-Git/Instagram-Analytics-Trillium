'use server';

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const POST_FILES = {
  ditl2026: 'ditl2026.csv',
  interns2026: 'interns2026.csv',
  mentors2026: 'mentors2026.csv',
  micon2026: 'micon2026.csv',
  nasdaq2026: 'nasdaq2026.csv',
};

// Every timestamp in these CSVs omits the year, so we assume 2026 (the year
// this dataset was collected) purely so `Date` can parse them. Points are
// returned as real [timestamp, value] pairs — each post's line starts on its
// own actual posting date rather than a shared t=0.
export async function getPostSeries(postCode) {
  const fileName = POST_FILES[postCode];
  if (!fileName) {
    throw new Error(`Unknown post code: ${postCode}`);
  }

  const filePath = path.join(process.cwd(), 'data', fileName);
  const fileContent = fs.readFileSync(filePath, 'utf8');

  const { data } = Papa.parse(fileContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const originMs = new Date(`${data[0]['Interval Start']} 2026`).getTime();

  const cumulative = [[originMs, 0]];
  const interval = [];
  data.forEach((row) => {
    const endMs = new Date(`${row['Interval End']} 2026`).getTime();
    const cumulativeViews = row['Cumulative Views'] ?? row['Culmulative Views'];
    cumulative.push([endMs, cumulativeViews]);
    interval.push([endMs, row['Views in Interval']]);
  });

  return { cumulative, interval };
}

// The "posted at" timestamp and Instagram link for every post, keyed by code
// — used so a selected post's chart can mark when OTHER posts (selected or
// not) went up, and link straight to them.
export async function getAllPostDates() {
  const entries = Object.entries(POST_FILES).map(([code, fileName]) => {
    const filePath = path.join(process.cwd(), 'data', fileName);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data } = Papa.parse(fileContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    const postedAt = new Date(`${data[0]['Interval Start']} 2026`).getTime();
    const link = data[0].Link?.trim() || null;
    return [code, { postedAt, link }];
  });

  return Object.fromEntries(entries);
}
