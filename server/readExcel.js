import xlsx from 'xlsx';

const workbook = xlsx.readFile('../Bảng dữ liệu/Nhanh.vn_Import_Order_Location1_v4.xlsm');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log(JSON.stringify(data.slice(0, 20), null, 2));
