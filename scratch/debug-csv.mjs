import fs from 'fs';

const content = fs.readFileSync('../Bảng dữ liệu/Khách Hàng - Tất Cả.csv', 'utf-8');
const lines = content.split('\n');

for (const line of lines) {
  if (line.startsWith('354521')) {
    const cols = line.split(';');
    console.log('ID:', cols[0]);
    console.log('Name:', cols[3]);
    console.log('Phone:', cols[12]);
    console.log('All cols count:', cols.length);
  }
}
