import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import NasdaqTimesSqu from '@/components/NasdaqTimesSqu';


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


export default async function DashboardPage() {
    const SPREADSHEET_ID = '18wYFbvgo3NtOUvJt-wHQct7Pz18KoRYNaCyAm8t45R4'; 
    const fileContent = await getGoogleSheetAsCSV(SPREADSHEET_ID, 'Mic-On');

    // 2. Parse the CSV file string to a JavaScript array of objects
    const parsed = Papa.parse(fileContent, {
    header: true,
    dynamicTyping: true, // Automatically turns string numbers into JS numbers
    skipEmptyLines: true,
    });

    const chartData = parsed.data;
    const link = chartData[0].Link;

    return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of application metrics pulled directly from CSV.</p>
        </div>
        <div className="ml-3">
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Post Link</a>
        </div>

        {/* 3. Send parsed data straight to the chart component */}
        <NasdaqTimesSqu data={chartData} />
    </div>
    );
}