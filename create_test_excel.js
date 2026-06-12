const xlsx = require('xlsx');

const workbook = xlsx.utils.book_new();

const events = [
  { 'Event ID': 'EVENT 01', Title: 'E1', Date: '1/1/2026', Tags: 't1' },
  { 'Event ID': 'EVENT 07', Title: 'E7', Date: '1/1/2026', Tags: 't2' }
];

const eventsSheet = xlsx.utils.json_to_sheet(events);
xlsx.utils.book_append_sheet(workbook, eventsSheet, 'Events');

xlsx.writeFile(workbook, 'test_upload.xlsx');
console.log('Test excel created');
