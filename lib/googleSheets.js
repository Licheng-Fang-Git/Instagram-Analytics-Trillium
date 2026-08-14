import { google } from 'googleapis';
import Papa from 'papaparse';

// ───────────────────────────────────────────────────────────────────────────
// Google Sheets WRITE access (creating a post's tab + writing its rows).
//
// The rest of the app READS sheets through the public CSV export (no auth).
// Creating tabs / writing rows needs authenticated access, so this module uses
// a Google service account. Provide its key via the GOOGLE_SERVICE_ACCOUNT_B64
// environment variable (the service-account JSON, base64-encoded — base64 avoids
// newline problems with the private key in .env files). The service account's
// email must be shared on the spreadsheet with Editor access.
//
// Nothing here runs unless that env var is set, so the app works fine before the
// credentials are in place — Add Post just skips the sheet-write step.
// ───────────────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';

// Column order the app expects when it reads a post's tab back.
export const SHEET_COLUMNS = [
  'Interval Start',
  'Interval End',
  'Interval Length',
  'Views in Interval',
  'Cumulative Views',
  'Link',
  'Ad Dates',
  'Ad Views',
];

export function sheetsConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_B64;
}

// ───────────────────────────────────────────────────────────────────────────
// The "Posts" index tab — the post registry's persistence (see postsRegistry).
// One row per post; the header mirrors the registry entry fields. Reads use
// the authenticated API when credentials are configured (fresh, safe to read
// right after a write) and fall back to the public CSV export otherwise, so
// read-only local dev works without a service account.
// ───────────────────────────────────────────────────────────────────────────

export const POSTS_INDEX_TAB = 'Posts';

const POSTS_INDEX_COLUMNS = [
  'Code',
  'Slug',
  'Title',
  'Month',
  'Year',
  'Date Posted',
  'Link',
  'Sheet Tab',
  'Created At',
];

function indexRowToPost(cells) {
  const s = (i) => String(cells[i] ?? '').trim();
  return {
    code: s(0),
    slug: s(1),
    title: s(2),
    month: s(3),
    year: Number(s(4)) || null,
    datePosted: s(5) || null,
    link: s(6) || null,
    sheetTab: s(7) || null,
    createdAt: s(8) || null,
  };
}

function postToIndexRow(p) {
  return [
    p.code ?? '',
    p.slug ?? '',
    p.title ?? '',
    p.month ?? '',
    p.year ?? '',
    p.datePosted ?? '',
    p.link ?? '',
    p.sheetTab ?? '',
    p.createdAt ?? '',
  ];
}

// Read the Posts index tab. Returns the post list, or null when the tab
// doesn't exist yet (i.e. the registry hasn't been migrated to the sheet) so
// the caller can fall back to its legacy store.
export async function readPostsIndex() {
  const sheets = getClient();
  if (sheets) {
    let res;
    try {
      res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${q(POSTS_INDEX_TAB)}!A:I`,
      });
    } catch {
      return null; // tab doesn't exist yet
    }
    const rows = res.data.values || [];
    if (rows.length === 0) return null; // tab exists but was never seeded
    return rows.slice(1).map(indexRowToPost).filter((p) => p.code && p.slug);
  }

  // No credentials — read through the public CSV export like the rest of the
  // app. A missing tab comes back as an error page, which fails the header
  // check below and falls through to null.
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(POSTS_INDEX_TAB)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const { data } = Papa.parse(await res.text(), { header: true, skipEmptyLines: true });
    if (!data.length || !('Code' in data[0])) return null;
    return data
      .map((r) => indexRowToPost(POSTS_INDEX_COLUMNS.map((c) => r[c])))
      .filter((p) => p.code && p.slug);
  } catch {
    return null;
  }
}

// Replace the Posts index tab with the given post list, creating the tab if
// it doesn't exist yet. Refuses to clobber a "Posts" tab that holds something
// other than this index.
export async function writePostsIndex(posts) {
  const sheets = getClient();
  if (!sheets) throw new Error('Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_B64 missing).');

  let a1 = null;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${q(POSTS_INDEX_TAB)}!A1`,
    });
    a1 = res.data.values?.[0]?.[0] ?? null;
  } catch {
    // Tab doesn't exist — create it (appended at the end, after the post tabs).
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: POSTS_INDEX_TAB } } }] },
    });
  }
  if (a1 != null && a1 !== 'Code') {
    throw new Error(`Tab "${POSTS_INDEX_TAB}" already exists with unexpected content — refusing to overwrite it.`);
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${q(POSTS_INDEX_TAB)}!A:I`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${q(POSTS_INDEX_TAB)}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [POSTS_INDEX_COLUMNS, ...posts.map(postToIndexRow)] },
  });
}

function getClient() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Case-insensitive lookup of a value in a parsed row by any of the given header
// aliases (Excel exports vary in exact wording/spacing).
function pick(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const k = keys.find((key) => key.trim().toLowerCase() === alias.toLowerCase());
    if (k != null && row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  return '';
}

// Map a parsed Excel row to the sheet's column order.
function toSheetRow(row) {
  return [
    pick(row, ['Interval Start']),
    pick(row, ['Interval End']),
    pick(row, ['Interval Length']),
    pick(row, ['Views in Interval', 'Views']),
    pick(row, ['Cumulative Views', 'Culmulative Views']),
    '', // Link — filled only on the first data row (below)
    pick(row, ['Ad Dates', 'Ad Start']),
    pick(row, ['Ad Views']),
  ];
}

// Create (or reuse) a tab for a post and write the header, the Instagram link
// (in the Link column of the first data row), and any uploaded data rows.
// Returns the tab title actually written.
export async function createPostTab({ tabName, link, rows = [] }) {
  const sheets = getClient();
  if (!sheets) throw new Error('Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_B64 missing).');
  if (tabName === POSTS_INDEX_TAB) throw new Error(`"${POSTS_INDEX_TAB}" is reserved for the post registry — pick a different title.`);

  // Place the new tab immediately to the RIGHT of the "Overview" tab.
  let insertIndex;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const overview = (meta.data.sheets || []).find((s) => s.properties.title === 'Overview');
    if (overview) insertIndex = overview.properties.index + 1;
  } catch {
    // fall back to default (append at the end) if the lookup fails
  }

  // 1. Create the tab at that position. If it already exists, keep going and
  //    overwrite its cells.
  try {
    const properties = { title: tabName };
    if (insertIndex != null) properties.index = insertIndex;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties } }] },
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/already exists/i.test(msg)) throw e;
  }

  // 2. Build the values: header + one row per uploaded data point. The Link goes
  //    in the first data row's Link column (that's where the app reads it from).
  const dataRows = rows.map(toSheetRow);
  if (dataRows.length === 0) dataRows.push(SHEET_COLUMNS.map(() => '')); // at least a Link row
  const linkCol = SHEET_COLUMNS.indexOf('Link');
  dataRows[0][linkCol] = link || '';

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${q(tabName)}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [SHEET_COLUMNS, ...dataRows] },
  });

  return tabName;
}

// Quote a tab name for A1 notation.
function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

// Push scraped view data — a { "Tab Name": [ [Interval Start, Interval End,
// Interval Length, Views, Cumulative, Link], ... ] } map (the scraper's
// scraped_views.json) — into the spreadsheet. For each tab it replaces ONLY the
// five data columns (A2:E) and LEAVES the header row and the Link (F), Ad Start
// (G) and Ad End (H) columns untouched. Only tabs that already exist are
// written; unknown tabs are skipped. Returns which tabs were updated vs skipped.
export async function pushScrapedData(dataMap) {
  const sheets = getClient();
  if (!sheets) throw new Error('Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_B64 missing).');

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties.title));

  const updated = [];
  const skipped = [];
  for (const [tab, rows] of Object.entries(dataMap || {})) {
    if (!existing.has(tab)) {
      skipped.push(tab);
      continue;
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${q(tab)}!A2:E` });
    if (Array.isArray(rows) && rows.length) {
      // Only the first five columns (Interval Start → Cumulative Views). Dropping
      // the 6th value keeps the Link (F) — and Ad Start/Ad End (G/H) — untouched.
      const cells = rows.map((r) => (Array.isArray(r) ? r.slice(0, 5) : r));
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${q(tab)}!A2:E`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: cells },
      });
    }
    updated.push({ tab, rows: Array.isArray(rows) ? rows.length : 0 });
  }
  return { updated, skipped };
}
