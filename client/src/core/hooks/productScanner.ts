import { RefObject, useEffect, useRef } from 'react';

/** Max gap between keystrokes that still counts as one barcode scan. */
const SCAN_MAX_INTERVAL_MS = 80;
/** If no more keys arrive (scanner without Enter suffix), commit the buffer. */
const SCAN_IDLE_FLUSH_MS = 140;
const SCAN_MIN_LENGTH = 4;
const DUPLICATE_LOCK_MS = 400;
const PRODUCT_SEARCH_SELECTOR = '[data-product-search-scan="true"]';

type ProductScanEvent = CustomEvent<{ barcode: string }>;

let lastHandled = { code: '', time: 0 };

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function isElementVisible(el: HTMLElement) {
  if (el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  if (typeof el.checkVisibility === 'function') {
    try {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    } catch {
      // Older browsers may not support options object.
    }
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isProductSearchElement(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement
    && target.matches(PRODUCT_SEARCH_SELECTOR)
    && !target.disabled
    && !target.readOnly
    && isElementVisible(target);
}

function resolveProductSearchTarget() {
  const focused = document.activeElement;
  if (isProductSearchElement(focused)) return focused;

  const primary = document.querySelector(`${PRODUCT_SEARCH_SELECTOR}[data-product-search-primary="true"]`);
  if (isProductSearchElement(primary)) return primary;

  const candidates = Array.from(document.querySelectorAll(PRODUCT_SEARCH_SELECTOR));
  return candidates.find(isProductSearchElement) || null;
}

function dispatchScan(input: HTMLInputElement, barcode: string) {
  input.dispatchEvent(new CustomEvent('product-scan', { bubbles: true, detail: { barcode } }));
}

/**
 * Register a product-search input as a scan target.
 * When a hardware barcode scanner emits a code, `onScan` receives the raw barcode string.
 * The page should fill the input and open suggestions (or auto-select on exact match).
 */
export function useProductScanTarget(inputRef: RefObject<HTMLInputElement | null>, onScan: (barcode: string) => void) {
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.dataset.productSearchScan = 'true';
    const listener = (event: Event) => {
      const barcode = String((event as ProductScanEvent).detail?.barcode || '').trim();
      if (barcode) handlerRef.current(barcode);
    };
    input.addEventListener('product-scan', listener);
    return () => input.removeEventListener('product-scan', listener);
  }, [inputRef]);
}

/**
 * Global keyboard wedge bridge for USB barcode scanners.
 * Scanners type characters very fast then usually send Enter.
 * We detect that pattern and route the code to the active/primary product search field.
 */
export function useProductScannerBridge() {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearIdle = () => {
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const resetBuffer = () => {
      bufferRef.current = '';
      lastKeyTimeRef.current = 0;
      clearIdle();
    };

    const commitScan = (raw: string, sourceEvent?: KeyboardEvent) => {
      const barcode = raw.trim();
      if (barcode.length < SCAN_MIN_LENGTH) return false;

      const now = Date.now();
      if (lastHandled.code === barcode && now - lastHandled.time < DUPLICATE_LOCK_MS) return false;

      const input = resolveProductSearchTarget();
      if (!input) return false;

      lastHandled = { code: barcode, time: now };
      sourceEvent?.preventDefault();
      sourceEvent?.stopPropagation();
      sourceEvent?.stopImmediatePropagation?.();

      input.focus({ preventScroll: true });
      dispatchScan(input, barcode);
      return true;
    };

    const scheduleIdleFlush = () => {
      clearIdle();
      idleTimerRef.current = window.setTimeout(() => {
        const barcode = bufferRef.current;
        resetBuffer();
        if (barcode.trim().length >= SCAN_MIN_LENGTH) {
          commitScan(barcode);
        }
      }, SCAN_IDLE_FLUSH_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const targetIsProductSearch = isProductSearchElement(event.target);
      const targetIsOtherEditable = isEditableElement(event.target) && !targetIsProductSearch;

      // Printable character — append to scan buffer when timing looks like a wedge scanner.
      if (event.key.length === 1) {
        const now = Date.now();
        const withinBurst = Boolean(bufferRef.current)
          && now - lastKeyTimeRef.current <= SCAN_MAX_INTERVAL_MS;

        if (!bufferRef.current || withinBurst) {
          bufferRef.current += event.key;
          lastKeyTimeRef.current = now;

          // Once we are clearly mid-scan, stop keys from polluting qty/price/other fields.
          if (targetIsOtherEditable && bufferRef.current.length >= 2) {
            event.preventDefault();
            event.stopPropagation();
          }

          scheduleIdleFlush();
          return;
        }

        // Gap too large → start a new potential scan from this key.
        resetBuffer();
        bufferRef.current = event.key;
        lastKeyTimeRef.current = now;
        scheduleIdleFlush();
        return;
      }

      // Most scanners suffix the code with Enter (sometimes Tab).
      if (event.key === 'Enter' || event.key === 'Tab') {
        const barcode = bufferRef.current;
        resetBuffer();
        if (barcode.trim().length < SCAN_MIN_LENGTH) return;

        // Prefer scan routing only when a product search field exists on the page.
        if (!resolveProductSearchTarget()) return;

        // When typing slowly in a normal field, buffer rarely reaches min length as one burst.
        commitScan(barcode, event);
        return;
      }

      // Ignore modifier-only; flush buffer on other control keys.
      if (event.key === 'Shift') return;
      resetBuffer();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      clearIdle();
    };
  }, []);
}
