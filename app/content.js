'use server';
import Papa from 'papaparse';

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

const EMPTY_METRICS = { views: 0, reach: 0, likes: 0, shares: 0, follows: 0, comments: 0, saves: 0 };

export async function getPostMetrics({ post_link } = {}) {
    // No link (e.g. a sheet fetch returned empty during build) -> zeros, don't crash.
    if (!post_link) return { ...EMPTY_METRICS };

    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4';
    const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Content');
    if (!fileContent) return { ...EMPTY_METRICS };

    const { data } = Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });

    const postLinkLength = post_link.length;
    const match = (data || []).find(
        (row) => row['Permalink'] === post_link.substring(0, postLinkLength)
    );
    if (!match) return { ...EMPTY_METRICS };

    return {
        views: match['Views'] ?? 0,
        reach: match['Reach'] ?? 0,
        likes: match['Likes'] ?? 0,
        shares: match['Shares'] ?? 0,
        follows: match['Follows'] ?? 0,
        comments: match['Comments'] ?? 0,
        saves: match['Saves'] ?? 0,
    };
}