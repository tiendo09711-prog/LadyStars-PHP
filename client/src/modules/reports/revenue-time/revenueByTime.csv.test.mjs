/**
 * Lightweight unit checks for CSV serializer (no test framework dependency).
 * Run: node client/src/modules/reports/revenue-time/revenueByTime.csv.test.mjs
 */

import assert from 'node:assert/strict';

const CSV_DELIMITER = ';';

function escapeCsvCell(cell, delimiter = CSV_DELIMITER) {
  const s = String(cell ?? '');
  const needsQuote =
    s.includes('"') ||
    s.includes('\n') ||
    s.includes('\r') ||
    s.includes(delimiter) ||
    s.startsWith(' ') ||
    s.endsWith(' ');
  if (needsQuote) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function serializeCsv(headers, rows, delimiter = CSV_DELIMITER) {
  const lines = [
    headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter),
    ...rows.map((r) => r.map((c) => escapeCsvCell(c, delimiter)).join(delimiter)),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

// BOM
const out = serializeCsv(['A', 'B'], [[1, 2]]);
assert.equal(out.charCodeAt(0), 0xfeff);

// Delimiter semicolon, 2 columns
const body = out.slice(1);
const lines = body.split('\r\n');
assert.equal(lines[0], 'A;B');
assert.equal(lines[1], '1;2');
assert.equal(lines[0].split(';').length, 2);

// Quote when contains delimiter
assert.equal(escapeCsvCell('a;b'), '"a;b"');
// Quote when contains quote
assert.equal(escapeCsvCell('a"b'), '"a""b"');
// Quote CR/LF
assert.equal(escapeCsvCell('a\nb'), '"a\nb"');

// Vietnamese labels preserved
const vi = serializeCsv(['Thời gian', 'Doanh thu'], [['01/07/2026', 180008328]]);
assert.ok(vi.includes('Thời gian'));
assert.ok(vi.includes('Doanh thu'));
assert.equal(vi.slice(1).split('\r\n')[0].split(';').length, 2);

// Column count stable with empty cells
const empty = serializeCsv(['X', 'Y', 'Z'], [['', 0, '']]);
assert.equal(empty.slice(1).split('\r\n')[1].split(';').length, 3);

console.log('revenueByTime.csv.test.mjs: all assertions passed');
