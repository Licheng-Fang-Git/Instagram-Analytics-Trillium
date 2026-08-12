import { google } from 'googleapis';

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

  // 1. Create the tab. If it already exists, keep going and overwrite its cells.
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
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
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [SHEET_COLUMNS, ...dataRows] },
  });

  return tabName;
}
