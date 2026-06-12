const xlsx = require('xlsx');

const filePath = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\scratch\\geopnodes\\7June GeoP Master Ledger Backup1.xlsx";
const workbook = xlsx.readFile(filePath);
const eventsSheet = workbook.Sheets['Events'];
const events = xlsx.utils.sheet_to_json(eventsSheet);

console.log("Event IDs in sheet:");
events.forEach(e => console.log(e['Event ID']));
