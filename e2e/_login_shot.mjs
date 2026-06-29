import { chromium } from 'playwright';
const base = process.argv[2];
const shots = [
  { name: 'login-desktop', width: 1440, height: 900 },
  { name: 'login-mobile', width: 390, height: 844 },
  { name: 'login-tablet', width: 820, height: 1180 },
];
const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/_shots/' + s.name + '.png', fullPage: false });
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
  console.log(s.name, 'overflow', JSON.stringify(overflow));
  await ctx.close();
}
await browser.close();
console.log('DONE');