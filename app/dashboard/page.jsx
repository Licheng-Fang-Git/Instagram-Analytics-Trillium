import Papa from 'papaparse';
import OverviewCharts from '@/components/OverviewCharts';
import TopPostsTable from '@/components/TopPostsTable';
import { getAllPostSummaries } from '@/app/compare/actions';
import { getAllPosts, postHref } from '@/lib/postsRegistry';

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


// Pulls live from Google Sheets on every request instead of baking data in at
// build time — keeps the dashboard fresh and avoids build-time fetch failures.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
  const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Overview');

  // 2. Parse the CSV file string to a JavaScript array of objects
  const parsed = Papa.parse(fileContent, {
    header: true,
    dynamicTyping: true, // Automatically turns string numbers into JS numbers
    skipEmptyLines: true,
  });

  const chartData = parsed.data;

  // Aggregate per-post metrics for the Top Posts table, joined with registry
  // metadata (title, slug, and the /{year}/{month}/{slug} link). Rows are
  // sorted by views inside the table component.
  const [summaries, registry] = await Promise.all([getAllPostSummaries(), getAllPosts()]);
  const byCode = new Map(registry.map((p) => [p.code, p]));
  const topPosts = summaries
    .filter((s) => byCode.has(s.code))
    .map((s) => {
      const p = byCode.get(s.code);
      return { ...s, title: p.title, slug: p.slug, href: postHref(p) };
    });

  return (
    <div className="max-w-[1440px] px-12 pb-[72px] pt-10">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <div className="trlm-eyebrow">Instagram · @trilliumtrading</div>
          <h1 className="m-0 font-serif text-[52px] leading-[1.05] tracking-[-0.01em] text-white">
            Dashboard
          </h1>
          <p className="m-0 max-w-[60ch] text-[15px] text-[#e6e6e6]">
            {`Metrics pulled up to ${chartData[chartData.length-1]['Date']} `}
          </p>
        </header>
        <OverviewCharts data={chartData} />
        <TopPostsTable posts={topPosts} />
      </div>
    </div>
  );
}