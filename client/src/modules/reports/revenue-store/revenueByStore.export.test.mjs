/**
 * Focused export smoke checks. Run:
 * node client/src/modules/reports/revenue-store/revenueByStore.export.test.mjs
 */

import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

const delimiter = ';';

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsv(headers, rows) {
  return `\uFEFFsep=;\r\n${[headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(delimiter))
    .join('\r\n')}`;
}

const csv = serializeCsv(['Cửa hàng', 'Doanh thu'], [['CH; Trung tâm', 125000], ['CH "A"', 0]]);
assert.equal(csv.charCodeAt(0), 0xfeff);
const csvLines = csv.slice(1).split('\r\n');
assert.equal(csvLines[0], 'sep=;');
assert.equal(csvLines[1], 'Cửa hàng;Doanh thu');
assert.equal(csvLines[2], '"CH; Trung tâm";125000');
assert.equal(csvLines[3], '"CH ""A""";0');

const worksheet = XLSX.utils.aoa_to_sheet([
  ['Cửa hàng', 'Doanh thu', 'Số hóa đơn'],
  ['CH Trung tâm', 125000, 4],
]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Theo cua hang');
const parsed = XLSX.read(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
const sheet = parsed.Sheets['Theo cua hang'];
assert.equal(sheet.A1.v, 'Cửa hàng');
assert.equal(sheet.B2.v, 125000);
assert.equal(sheet.B2.t, 'n');
assert.equal(sheet.C2.v, 4);

console.log('revenueByStore.export.test.mjs: all assertions passed');
