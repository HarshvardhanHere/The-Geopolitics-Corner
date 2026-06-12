const { parse } = require('url');

function parseCommaSeparated(val) {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val;
  return val.toString().split(',').map((item) => item.trim()).filter(Boolean);
}

function parseExcelDateStr(val) {
  if (!val) return '';
  let d;
  if (val instanceof Date) {
    d = val;
  } else {
    const str = val.toString().trim();
    const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`);
    } else {
      const mmyyyy = str.match(/^(\d{1,2})\/(\d{4})$/);
      if (mmyyyy) {
        d = new Date(`${mmyyyy[2]}-${mmyyyy[1].padStart(2,'0')}-01`);
      } else {
        d = new Date(str);
      }
    }
  }
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

const xlsx = require('xlsx');

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\scratch\\geopnodes\\7June GeoP Master Ledger Backup1.xlsx";
const workbook = xlsx.readFile(filePath, { cellDates: true });

const eventsSheet = workbook.Sheets['Events'];
const rows = xlsx.utils.sheet_to_json(eventsSheet, { defval: null });

let eventsToInsert = [];
const dbEventsMap = new Map(); // Simulate empty DB for now
for (const row of rows) {
  const event_id = row['Event ID']?.toString().trim();
  const title = row['Title']?.toString().trim();
  const start_date = parseExcelDateStr(row['Date']);
  const tags = parseCommaSeparated(row['Tags']);

  if (!event_id || !title || !start_date) {
      console.log(`Skipped event row due to missing fields: event_id=${event_id}, title=${title}, start_date=${start_date}`);
      continue;
  }
  
  if (!dbEventsMap.has(event_id)) {
     eventsToInsert.push({ event_id, title, start_date, tags });
  }
}

console.log("Events to insert count:", eventsToInsert.length);
console.log(eventsToInsert);
