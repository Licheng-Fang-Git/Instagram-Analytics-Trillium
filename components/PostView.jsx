import Papa from 'papaparse';
import { notFound } from 'next/navigation';
import PostDashboard from '@/components/PostDashboard';
import { getPostMetrics } from '@/app/content.js';
import { getPostBySlug } from '@/lib/postsRegistry';

const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';

async function getGoogleSheetAsCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error('Failed to fetch sheet data:', e);
    return '';
  }
}

// The one shared post-detail loader. Every post route (the year/month folders
// AND the flat fallback) renders this by slug — the registry is the source of
// truth, so posts (current and future) resolve here with no per-post code.
export default async function PostView({ slug }) {
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  // Posts with a Google Sheet tab render the full growth charts; a summary-only
  // post shows its stat cards from the form-entered metrics.
  let chartData = [];
  let link = post.link || null;
  let metrics = post.metrics || {};

  if (post.sheetTab) {
    const csv = await getGoogleSheetAsCSV(post.sheetTab);
    const parsed = Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true });
    chartData = parsed.data || [];
    link = chartData[0]?.Link || link;
    metrics = await getPostMetrics({ post_link: link });
  }

  return (
    <PostDashboard
      title={post.title}
      slug={post.slug}
      month={post.month}
      metrics={metrics}
      chartData={chartData}
      link={link}
    />
  );
}
