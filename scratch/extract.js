const fs = require('fs');

const html = fs.readFileSync('c:/Users/tiend/Desktop/LadyStars/Bảng dữ liệu/Cấu trúc.txt', 'utf8');

const regex = /<span[^>]*>([^<]+)<\/span>/g;
let match;
const items = new Set();
while ((match = regex.exec(html)) !== null) {
  if (match[1].trim()) {
    items.add(match[1].trim());
  }
}

// Just try to find the menu links
const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
const links = [];
while ((match = linkRegex.exec(html)) !== null) {
  const href = match[1];
  let text = match[2].trim();
  // if text is empty, it might be nested, let's try a better regex or just rough parse
  if (href.startsWith('/') && !href.includes('assets') && !href.includes('javascript:')) {
    links.push({ href, text });
  }
}

fs.writeFileSync('c:/Users/tiend/Desktop/LadyStars/scratch/menu_links.json', JSON.stringify(links, null, 2));
console.log('Done extracting links:', links.length);
