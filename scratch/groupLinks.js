const fs = require('fs');
const links = JSON.parse(fs.readFileSync('c:/Users/tiend/Desktop/LadyStars/scratch/menu_links.json', 'utf8'));

const groups = {
  'Báo cáo & Thống kê': [],
  'Sản phẩm & Kho hàng': [],
  'Bán hàng & Đơn hàng': [],
  'Khách hàng & Đối tác': [],
  'Kế toán & Tài chính': [],
  'Kênh bán (TMĐT)': [],
  'Cài đặt & Khác': []
};

links.forEach(l => {
  const h = l.href;
  if (h.includes('/report') || h.includes('bao-cao')) {
    groups['Báo cáo & Thống kê'].push(l);
  } else if (h.includes('/product') || h.includes('/inventory') || h.includes('/supplier')) {
    groups['Sản phẩm & Kho hàng'].push(l);
  } else if (h.includes('/order') || h.includes('/pos') || h.includes('/shipping')) {
    groups['Bán hàng & Đơn hàng'].push(l);
  } else if (h.includes('/customer') || h.includes('/social') || h.includes('/zalo') || h.includes('/sms')) {
    groups['Khách hàng & Đối tác'].push(l);
  } else if (h.includes('/accounting') || h.includes('/invoice')) {
    groups['Kế toán & Tài chính'].push(l);
  } else if (h.includes('/ecommerce')) {
    groups['Kênh bán (TMĐT)'].push(l);
  } else {
    groups['Cài đặt & Khác'].push(l);
  }
});

let out = `export const megaMenuGroups = [\n`;
for (const [groupName, items] of Object.entries(groups)) {
  if (items.length > 0) {
    out += `  {\n    title: '${groupName}',\n    items: [\n`;
    items.forEach(i => {
      out += `      { text: '${i.text.replace(/'/g, "\\'")}', href: '${i.href}' },\n`;
    });
    out += `    ]\n  },\n`;
  }
}
out += `];\n`;

fs.writeFileSync('c:/Users/tiend/Desktop/LadyStars/scratch/dashboardLinks.ts', out);
console.log('Done organizing links');
