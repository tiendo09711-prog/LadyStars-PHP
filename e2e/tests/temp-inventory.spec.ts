import { test } from '@playwright/test';
import * as fs from 'fs';

test('Extract UI inventory for warehouse transfers', async ({ page }) => {
  await page.goto('/warehouse/transfers');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Give it a bit more time for any client side render

  const inventoryList = await page.evaluate(() => {
    const visible = (el: Element) => {
      const style = window.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

    return {
      route: '/warehouse/transfers',
      buttons: Array.from(document.querySelectorAll('button,[role="button"],a.btn,input[type="button"],input[type="submit"]'))
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
        })),
      links: Array.from(document.querySelectorAll('a[href]'))
        .filter(visible)
        .map((el, index) => ({
          index,
          text: text(el),
          href: el.getAttribute('href'),
        })),
      tabs: Array.from(document.querySelectorAll('[role="tab"], .tab-item, .nav-tabs li'))
        .filter(visible)
        .map((el, index) => ({
           index,
           text: text(el),
           className: (el as HTMLElement).className
        })),
    };
  });

  await page.goto('/warehouse/transfers/create');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const inventoryCreate = await page.evaluate(() => {
    const visible = (el: Element) => {
      const style = window.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

    return {
      route: '/warehouse/transfers/create',
      buttons: Array.from(document.querySelectorAll('button,[role="button"],a.btn,input[type="button"],input[type="submit"]'))
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
        })),
    };
  });

  fs.writeFileSync('inventory-transfers.json', JSON.stringify({
    list: inventoryList,
    create: inventoryCreate
  }, null, 2));
});
