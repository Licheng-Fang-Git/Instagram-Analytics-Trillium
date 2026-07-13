import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import MeetTheMentors from '@/components/MeetTheMentor';

export default async function DashboardPage() {
  // 1. Locate the local CSV file (placed inside src/data/meet_2026_interns.csv)
  const filePath = path.join(process.cwd(), 'data/meet_2026_interns.csv');
  const fileContent = fs.readFileSync(filePath, 'utf8');

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
      <MeetTheMentors data={chartData} />
    </div>
  );
}