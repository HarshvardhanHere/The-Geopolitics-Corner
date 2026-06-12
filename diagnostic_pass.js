const xlsx = require('xlsx');

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

function expandEventId(shortId) {
  if (!shortId) return '';
  const match = shortId.trim().match(/^E(\d+)$/i);
  if (match) {
    return `EVENT ${match[1].padStart(2, '0')}`;
  }
  return shortId.trim();
}

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\scratch\\geopnodes\\7June GeoP Master Ledger Backup1.xlsx";
const workbook = xlsx.readFile(filePath, { cellDates: true });
const eventsSheet = workbook.Sheets['Events'];
const rows = xlsx.utils.sheet_to_json(eventsSheet, { defval: null });

let totalRows = rows.length;
let idCounts = {};
let uniqueIds = new Set();
let exactDuplicatesRemoved = 0;
let uniqueRows = [];
let rowHashes = new Set();

for (const row of rows) {
    // We'll normalize using expandEventId for diagnostic
    const rawId = row['Event ID']?.toString().trim();
    const event_id = expandEventId(rawId);
    if (event_id) {
        idCounts[event_id] = (idCounts[event_id] || 0) + 1;
        uniqueIds.add(event_id);
    }
    
    // exact duplicate check
    const title = row['Title']?.toString().trim();
    const start_date = parseExcelDateStr(row['Date']);
    const tags = parseCommaSeparated(row['Tags']).join(',');
    
    const rowHash = `${event_id}|${title}|${start_date}|${tags}`;
    if (rowHashes.has(rowHash)) {
        exactDuplicatesRemoved++;
    } else {
        rowHashes.add(rowHash);
        uniqueRows.push(row);
    }
}

console.log(`Events Worksheet Rows: ${totalRows}`);
console.log(`Unique Event IDs: ${uniqueIds.size}`);

console.log("\nDuplicate Events Found:");
for (const [id, count] of Object.entries(idCounts)) {
    if (count > 1) {
        console.log(`* ${id} (${count} rows)`);
    }
}

console.log(`\nExact Duplicate Rows Eliminated: ${exactDuplicatesRemoved}`);

const e7Rows = rows.filter(r => expandEventId(r['Event ID']?.toString()) === 'EVENT 07');
console.log(`\nTotal EVENT 07 rows: ${e7Rows.length}`);
const uniqueE7Rows = new Set(e7Rows.map(r => `${expandEventId(r['Event ID']?.toString())}|${r['Title']?.toString().trim()}|${parseExcelDateStr(r['Date'])}`));
console.log(`Total unique EVENT 07 records: ${uniqueE7Rows.size}`);
