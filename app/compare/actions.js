'use server';

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const POST_FILES = {
    ditl2026: 'Day_in_the_Life',
    interns2026: 'Meet The Interns',
    mentors2026: 'Meet The Mentors',
    micon2026: 'Mic-On',
    nasdaq2026: 'Nasdaq',
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

    const originMs = new Date(`${data[0]['Interval Start']} 2026`).getTime();

    const cumulative = [
        [originMs, 0]
    ];
    const interval = [];
    data.forEach((row) => {
        const endMs = new Date(`${row['Interval End']} 2026`).getTime();
        const cumulativeViews = row['Cumulative Views'];
        cumulative.push([endMs, cumulativeViews]);
        interval.push([endMs, row['Views in Interval']]);
    });

    return { cumulative, interval };
}