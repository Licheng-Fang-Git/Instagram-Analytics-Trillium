'use server';

import Papa from 'papaparse';
import { normalizeRows } from '@/lib/chartAggregation';
import { getPostMetrics } from '@/app/content.js';

const POST_FILES = {
    ditl2026: 'Day_in_the_Life',
    interns2026: 'Meet The Interns',
    mentors2026: 'Meet The Mentors',
    micon2026: 'Mic-On',
    nasdaq2026: 'Nasdaq',
    misconceptions2026: 'Misconceptions-Reel',
    cht2026: 'College-hot-takes',
};

async function getGoogleSheetAsCSV(sheetId, sheetName = 'Meet The Interns') {
    // Construct the export URL pointing to the CSV export endpoint
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // This string contains your raw CSV data
        const csvData = await response.text();
        return csvData;

    } catch (error) {
        console.error("Failed to fetch sheet data:", error);
    }
}

export async function getPostSeries(postCode) {
    const fileName = POST_FILES[postCode];
    if (!fileName) {
        throw new Error(`Unknown post code: ${postCode}`);
    }

    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
    const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, fileName);

    const { data } = Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });

    // Return compact per-row data (timestamp, native interval length, views,
    // cumulative) so the client can re-bucket the charts to any target size.
    return { rows: normalizeRows(data) };
}

// Everything the Compare view needs for one post: the re-bucketable time-series
// rows, the post's Instagram link, and its aggregate metrics (views/reach/likes/
// etc.) for the slot cards and the head-to-head table.
export async function getPostSummary(postCode) {
    const fileName = POST_FILES[postCode];
    if (!fileName) {
        throw new Error(`Unknown post code: ${postCode}`);
    }

    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
    const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, fileName);

    const { data } = Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });

    const link = data[0]?.Link?.trim() || null;
    const metrics = await getPostMetrics({ post_link: link });

    return { rows: normalizeRows(data), link, metrics };
}

// Aggregate metrics for every post, for the overview "Top Posts" table.
// Fetches the shared Content sheet once, then each post's own sheet just for
// its Instagram link, and matches the two on permalink.
export async function getAllPostSummaries() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';

    const parse = (csv) =>
        csv ? Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data : [];

    const contentCsv = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Content');
    const content = parse(contentCsv);
    const num = (v) => Number(v) || 0;

    const entries = await Promise.all(
        Object.entries(POST_FILES).map(async ([code, sheetName]) => {
            const data = parse(await getGoogleSheetAsCSV(SPREADSHEET_ID, sheetName));
            const link = data[0]?.Link?.trim() || null;
            const row = link ? content.find((r) => r['Permalink'] === link) : null;
            return {
                code,
                link,
                views: num(row?.['Views']),
                reach: num(row?.['Reach']),
                likes: num(row?.['Likes']),
                shares: num(row?.['Shares']),
                follows: num(row?.['Follows']),
                comments: num(row?.['Comments']),
                saves: num(row?.['Saves']),
            };
        })
    );

    return entries;
}

// Per-post normalized rows for the "Best Time to Post" heatmap. Each entry is
// an array of { tEnd, intervalLength, views, cumulative } so the client can
// re-tile each post by its native Interval Length (via bucketByIntervalLength)
// and fold the resulting buckets onto a day-of-week x time-of-day grid.
export async function getAllTimingSeries() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';

    const entries = await Promise.all(
        Object.entries(POST_FILES).map(async ([code, sheetName]) => {
            const csv = await getGoogleSheetAsCSV(SPREADSHEET_ID, sheetName);
            const data = csv
                ? Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
                : [];
            return [code, normalizeRows(data)];
        })
    );

    return Object.fromEntries(entries);
}

// The "posted at" timestamp and Instagram link for every post, keyed by code
// — used so a selected post's chart can mark when OTHER posts (selected or
// not) went up, and link straight to them. Pulls from the same Google Sheet
// as getPostSeries now, so it stays live instead of reading stale local CSVs.
export async function getAllPostDates() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';

    const entries = await Promise.all(
        Object.entries(POST_FILES).map(async([code, sheetName]) => {
            const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, sheetName);
            const { data } = Papa.parse(fileContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
            });
            const postedAt = new Date(`${data[0]['Interval Start']} 2026`).getTime();
            const link = data[0].Link?.trim() || null;
            return [code, { postedAt, link }];
        })
    );

    return Object.fromEntries(entries);
}