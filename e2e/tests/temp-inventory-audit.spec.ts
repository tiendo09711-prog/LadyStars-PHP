import { test } from '@playwright/test';
import * as fs from 'fs';

test('inventory /warehouse/audit', async ({ page }) => {
  await page.goto('/warehouse/audit');
  await page.waitForLoadState('networkidle');

  const getInventory = async () => {
    return await page.evaluate(() => {
      const visible = (el: Element) => {
        const style = window.getComputedStyle(el);
        const rect = (el as HTMLElement).getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };

      const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

      return {
        buttons: Array.from(document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]'))
          .filter(visible)
          .map((el, index) => ({
            index,
            tag: el.tagName.toLowerCase(),
            text: text(el),
            aria: el.getAttribute('aria-label'),
            title: el.getAttribute('title'),
            href: el.getAttribute('href'),
            className: (el as HTMLElement).className,
          })),
        inputs: Array.from(document.querySelectorAll('input,select,textarea'))
          .filter(visible)
          .map((el, index) => ({
            index,
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type'),
            name: el.getAttribute('name'),
            placeholder: el.getAttribute('placeholder'),
            aria: el.getAttribute('aria-label'),
            value: (el as HTMLInputElement).value,
          })),
        tables: Array.from(document.querySelectorAll('table'))
          .filter(visible)
          .map((table, index) => ({
            index,
            headers: Array.from(table.querySelectorAll('th')).map(text),
            rowCount: table.querySelectorAll('tbody tr').length,
            rows: Array.from(table.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(text))
          })),
        links: Array.from(document.querySelectorAll('a[href]'))
          .filter(visible)
          .map((el, index) => ({
            index,
            text: text(el),
            href: el.getAttribute('href'),
          })),
        tabs: Array.from(document.querySelectorAll('[role="tab"]'))
          .filter(visible)
          .map((el, index) => ({
            index,
            text: text(el),
            selected: el.getAttribute('aria-selected'),
          })),
      };
    });
  };

  const inventoryTab1 = await getInventory();

  // click tab 2
  const tabs = await page.locator('[role="tab"]').all();
  if (tabs.length > 1) {
    await tabs[1].click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for animation and API
  }
  
  const inventoryTab2 = await getInventory();

  fs.writeFileSync('warehouse-audit-inventory.json', JSON.stringify({
    tab1: inventoryTab1,
    tab2: inventoryTab2
  }, null, 2));

});
