'use server';

import Papa from 'papaparse';
import { normalizeRows, parseTs } from '@/lib/chartAggregation';
import { getPostMetrics } from '@/app/content.js';

const POST_FILES = {
    ditl2026: 'Day_in_the_Life',
    interns2026: 'Meet The Interns',
    mentors2026: 'Meet The Mentors',
    micon2026: 'Mic-On',
    nasdaq2026: 'Nasdaq',
    misconceptions2026: 'Misconceptions-Reel',
    cht2026: 'College-hot-takes',
    nid2026: 'National-Intern-Day',
    poker2026: 'Poker-2026',
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

// The account's daily Overview series (Date + per-day Views/Follows/Reach),
// for the "Analyze Post" impact chart. Sorted chronologically.
export async function getOverviewSeries() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
    const csv = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Overview');
    const data = csv ? Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data : [];
    const num = (v) => Number(v) || 0;
    return data
        .filter((r) => r && r['Date'])
        .map((r) => ({
            t: new Date(`${r['Date']}T00:00:00`).getTime(),
            views: num(r['Views']),
            follows: num(r['Follows']),
            reach: num(r['Reach']),
        }))
        .filter((r) => Number.isFinite(r.t))
        .sort((a, b) => a.t - b.t);
}

// Per-post data for the "Analyze Post" impact chart: publish time, end time,
// Instagram link, and aggregate metrics — keyed by code.
export async function getAllPostImpact() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
    const parse = (csv) =>
        csv ? Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data : [];
    const num = (v) => Number(v) || 0;
    // Some sheets already include the year in the timestamp; only append 2026 if not.
    const parseD = (s) => {
        const str = String(s ?? '');
        return new Date(/\d{4}/.test(str) ? str : `${str} 2026`).getTime();
    };

    const content = parse(await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Content'));

    const entries = await Promise.all(
        Object.entries(POST_FILES).map(async ([code, sheetName]) => {
            const data = parse(await getGoogleSheetAsCSV(SPREADSHEET_ID, sheetName));
            const link = data[0]?.Link?.trim() || null;
            const postedAt = parseD(data[0]?.['Interval Start']);
            const last = data[data.length - 1] || {};
            const endAt = parseD(last['Interval End'] ?? last['Interval Start']);
            const row = link ? content.find((r) => r['Permalink'] === link) : null;
            return [
                code,
                {
                    link,
                    postedAt,
                    endAt,
                    metrics: {
                        views: num(row?.['Views']),
                        reach: num(row?.['Reach']),
                        likes: num(row?.['Likes']),
                        shares: num(row?.['Shares']),
                        follows: num(row?.['Follows']),
                        comments: num(row?.['Comments']),
                        saves: num(row?.['Saves']),
                    },
                },
            ];
        })
    );

    return Object.fromEntries(entries);
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

    // Daily ad-boost entries. The organic view series is left untouched — ad
    // views are drawn as their own bar overlay, not folded into the lines.
    const adEntries = parseAdEntries(data);

    // Ad views to draw as bars: only the days that actually carry view data
    // (empty / "n/a" days have no bar).
    const adViews = adEntries
        .filter((e) => e.views != null)
        .map((e) => ({ t: e.date, views: e.views }));

    // Boosted orange markers: the boost ran from the first ad date to the last,
    // so mark those two moments (start filled, end hollow).
    const adWindows = adEntries.length
        ? [{
            start: Math.min(...adEntries.map((e) => e.date)),
            end: Math.max(...adEntries.map((e) => e.date)),
        }]
        : [];

    return { rows: normalizeRows(data), link, metrics, adWindows, adViews };
}

// Pull the post's daily ad-boost entries from the "Ad Dates" column (a couple of
// sheets label it "Ad Start") plus "Ad Views". Each entry is a { date, views }
// pair; an empty or "n/a" view cell means "boosted that day, but no view data",
// so the date is kept (for the boost markers) while views stays null (nothing to
// fold in). Rows without a parseable date are skipped.
function parseAdEntries(data) {
    const entries = [];
    for (const r of data) {
        const rawDate = r['Ad Dates'] != null ? r['Ad Dates'] : r['Ad Start'];
        const dStr = rawDate != null ? String(rawDate).trim() : '';
        if (!dStr) continue;
        const date = parseTs(dStr);
        if (!Number.isFinite(date)) continue;
        const vStr = r['Ad Views'] != null ? String(r['Ad Views']).trim() : '';
        const views = vStr === '' || vStr.toLowerCase() === 'n/a' ? NaN : Number(vStr);
        entries.push({ date, views: Number.isFinite(views) ? views : null });
    }
    return entries;
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

// Resolve a post's preview image server-side. Prefers the embed's media image,
// which is the real, uncropped post image; og:image is only a center-cropped
// square for photos/carousels (it cuts off the sides), so it's just a fallback.
// Returns null on any failure so the UI can fall back cleanly. Fetched fresh
// (no cache) because scontent URLs carry a short-lived expiry token.
export async function getInstagramImage(link) {
    const m = String(link || '').match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
    if (!m) return null;
    const code = m[1];

    const fetchText = async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: controller.signal,
                cache: 'no-store',
            });
            return res.ok ? await res.text() : null;
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    };

    // Preferred: the embed's <img class="EmbeddedMediaImage"> — full, uncropped.
    const embed = await fetchText(`https://www.instagram.com/p/${code}/embed/captioned/`);
    if (embed) {
        const tag = embed.match(/<img[^>]*EmbeddedMediaImage[^>]*>/i);
        const src = tag && tag[0].match(/src="([^"]+)"/i);
        if (src) return src[1].replace(/&amp;/g, '&');
    }

    // Fallback: og:image from the post page (square-cropped for photos).
    const page = await fetchText(`https://www.instagram.com/p/${code}/`);
    if (page) {
        const og = page.match(/<meta property="og:image" content="([^"]+)"/i);
        if (og) return og[1].replace(/&amp;/g, '&');
    }
    return null;
}

function decodeHtml(s) {
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// Resolve a post's image AND caption in one embed fetch (the /embed/captioned/
// page carries both). Returns { image, caption }, either null on failure.
export async function getInstagramMeta(link) {
    const m = String(link || '').match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
    if (!m) return { image: null, caption: null };
    const code = m[1];

    const fetchText = async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: controller.signal,
                cache: 'no-store',
            });
            return res.ok ? await res.text() : null;
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    };

    const result = { image: null, caption: null };
    const embed = await fetchText(`https://www.instagram.com/p/${code}/embed/captioned/`);
    if (embed) {
        const tag = embed.match(/<img[^>]*EmbeddedMediaImage[^>]*>/i);
        const src = tag && tag[0].match(/src="([^"]+)"/i);
        if (src) result.image = src[1].replace(/&amp;/g, '&');

        const cap = embed.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
        if (cap) {
            const text = decodeHtml(
                cap[1]
                    .replace(/<a[^>]*CaptionUsername[^>]*>[\s\S]*?<\/a>/i, '')
                    .replace(/<[^>]+>/g, ' ')
            )
                .replace(/\s+/g, ' ')
                .replace(/\s*View all( \d+)? comments?\s*$/i, '')
                .trim();
            if (text) result.caption = text;
        }
    }

    if (!result.image) {
        const page = await fetchText(`https://www.instagram.com/p/${code}/`);
        if (page) {
            const og = page.match(/<meta property="og:image" content="([^"]+)"/i);
            if (og) result.image = og[1].replace(/&amp;/g, '&');
        }
    }

    return result;
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