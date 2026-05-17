import xlsx from 'xlsx';

const workbook = xlsx.readFile('C:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Bảng Sản Phẩm.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const headers = data[0];

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (!row) continue;
  const idx = headers.indexOf('Mã sản phẩm');
  if (row[idx] === 'MHNU 406') {
    const mapped = {};
    for (let j = 0; j < headers.length; j++) {
      mapped[headers[j]] = row[j];
    }
    console.log("MHNU 406 Excel Data:", mapped);
    break;
  }
}
