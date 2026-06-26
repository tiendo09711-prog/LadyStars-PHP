import { RefObject, useEffect, useRef } from 'react';

const SCAN_MAX_INTERVAL_MS = 45;
const SCAN_MIN_LENGTH = 4;
const DUPLICATE_LOCK_MS = 350;
const PRODUCT_SEARCH_SELECTOR = '[data-product-search-scan="true"]';

type ProductScanEvent = CustomEvent<{ barcode: string }>;

let lastHandled = { code: '', time: 0 };

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, [contenteditable="true"], [contenteditable=""]');
}

function isProductSearchElement(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement
    && target.matches(PRODUCT_SEARCH_SELECTOR)
    && !target.disabled
    && !target.readOnly
    && target.offsetParent !== null;
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

export function useProductScannerBridge() {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    const flush = () => {
      bufferRef.current = '';
      lastKeyTimeRef.current = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableElement(event.target) && !isProductSearchElement(event.target)) return;

      if (event.key.length === 1) {
        const now = Date.now();
        if (!bufferRef.current || now - lastKeyTimeRef.current <= SCAN_MAX_INTERVAL_MS) {
          bufferRef.current += event.key;
          lastKeyTimeRef.current = now;
          return;
        }
        flush();
        bufferRef.current = event.key;
        lastKeyTimeRef.current = now;
        return;
      }

      if (event.key !== 'Enter' && event.key !== 'Tab') return;
      const barcode = bufferRef.current.trim();
      flush();
      if (barcode.length < SCAN_MIN_LENGTH) return;
      const now = Date.now();
      if (lastHandled.code === barcode && now - lastHandled.time < DUPLICATE_LOCK_MS) return;
      const input = resolveProductSearchTarget();
      if (!input) return;
      lastHandled = { code: barcode, time: now };
      event.preventDefault();
      event.stopPropagation();
      dispatchScan(input, barcode);
      input.focus();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
