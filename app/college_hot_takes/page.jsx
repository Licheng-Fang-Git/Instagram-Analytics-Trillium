import Papa from 'papaparse';
import PostDashboard from '@/components/PostDashboard';
import { getPostMetrics } from '@/app/content.js';

async function getGoogleSheetAsCSV(sheetId, sheetName) {
  // Export the given sheet tab as CSV from Google Sheets.
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Failed to fetch sheet data:', error);
  }
}

// Pulls live from Google Sheets on every request instead of baking data in at
// build time — keeps the dashboard fresh and avoids build-time fetch failures.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
  const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'College-hot-takes');

  const parsed = Papa.parse(fileContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const chartData = parsed.data;
  const link = chartData[0]?.Link;
  const postMetrics = await getPostMetrics({ post_link: link });

  return (
    <PostDashboard
      title="College Hot Takes"
      slug="cht2026"
      month="July"
      metrics={postMetrics}
      chartData={chartData}
      link={link}
    />
  );
}
