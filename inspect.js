const XLSX = require('xlsx');

const workbook = XLSX.readFile('c:\\\\Users\\\\Admin\\\\.gemini\\\\antigravity-ide\\\\scratch\\\\geopnodes\\\\GeoP_Master_Ledger_Final_11Jun2026.xlsx');
const eventsSheet = workbook.Sheets['Events'];

if (eventsSheet) {
  const rows = XLSX.utils.sheet_to_json(eventsSheet, { defval: null });
  console.log("Total rows found in Events sheet:", rows.length);
  
  rows.forEach((row, idx) => {
    const event_id = row['Event ID']?.toString().trim();
    const title = row['Title']?.toString().trim();
    const start_date = row['Date'];
    
    if (idx >= 4) { // Only log after event 5 to see what's happening
      console.log(`Row ${idx + 2}: Event ID: '${event_id}', Title: '${title}', Date: '${start_date}'`);
    }
    if (!event_id || !title || !start_date) {
        console.log(`  -> WARNING: Missing required field at row ${idx + 2}`);
        console.log(`     Row data: ${JSON.stringify(row)}`);
    }
  });
} else {
  console.log("No 'Events' sheet found.");
}
