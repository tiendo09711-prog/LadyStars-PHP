import { RefObject, useEffect, useRef } from 'react';

/** Max gap between keystrokes that still counts as one barcode scan. */
const SCAN_MAX_INTERVAL_MS = 55;
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

/**
 * Free-text fields (tên KH, ghi chú, địa chỉ, email…) — users type Vietnamese here.
 * Hardware wedge must NEVER preventDefault / steal keys on these targets.
 * Unikey / Telex / VNI send rapid key sequences; intercepting them breaks diacritics
 * (e.g. typing "Tiến" collapsing to "ế").
 */
function isFreeTextTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly;
  }

  const contentEditable = target.getAttribute('contenteditable');
  if (target.isContentEditable || contentEditable === '' || contentEditable === 'true') {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) return false;
  if (target.disabled || target.readOnly) return false;
  // Product search still participates in the wedge bridge (keys always reach the input).
  if (target.matches(PRODUCT_SEARCH_SELECTOR)) return false;

  const type = String(target.type || 'text').toLowerCase();
  // Number / date / checkbox / radio / range stay interceptable so scanners
  // do not dump digits into qty/price when focus is wrong.
  const freeTextTypes = new Set([
    'text',
    'search',
    'email',
    'tel',
    'url',
    'password',
  ]);
  return !type || freeTextTypes.has(type);
}

/** IME / composition keys must never enter the scan buffer. */
function isImeKeyEvent(event: KeyboardEvent): boolean {
  if (event.isComposing) return true;
  // 229 = browser "IME processing" keyCode (Chrome/Edge/Firefox while composing).
  const code = event.keyCode || (event as KeyboardEvent & { which?: number }).which || 0;
  if (code === 229) return true;
  if (event.key === 'Process' || event.key === 'Unidentified') return true;
  return false;
}

/**
 * Reject human Vietnamese / free text that can land in the wedge buffer
 * when the user is on product-search (ASCII Telex keys still look "scannable").
 * Prefer digit-heavy or dense alphanumeric codes without spaces/diacritics.
 */
function looksLikeBarcodePayload(value: string): boolean {
  const raw = value.trim();
  if (raw.length < SCAN_MIN_LENGTH) return false;
  // Spaces / newlines = human phrase, not a wedge scan.
  if (/\s/.test(raw)) return false;
  // Any non-ASCII (Vietnamese diacritics) is never a scanner payload.
  if (/[^\x00-\x7F]/.test(raw)) return false;
  // Pure letters of normal word length are usually typed product names, not barcodes.
  // Real codes are digits or mixed alnum (e.g. SP001, EAN-13). Require a digit
  // OR length long enough for typical Code128 payloads.
  if (/^[A-Za-z]+$/.test(raw) && raw.length < 8) return false;
  return true;
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
 *
 * Critical: must not interfere with free-text typing (Vietnamese names, notes, etc.).
 */
export function useProductScannerBridge() {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const composingRef = useRef(false);

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
      if (!looksLikeBarcodePayload(barcode)) return false;

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
        if (looksLikeBarcodePayload(barcode)) {
          commitScan(barcode);
        }
      }, SCAN_IDLE_FLUSH_MS);
    };

    const onCompositionStart = () => {
      composingRef.current = true;
      resetBuffer();
    };
    const onCompositionEnd = () => {
      composingRef.current = false;
      resetBuffer();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (composingRef.current || isImeKeyEvent(event)) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      // Free-text (tên, ghi chú, địa chỉ…): never buffer / preventDefault.
      // This is the main fix for Vietnamese IME + Unikey on the whole app.
      if (isFreeTextTypingTarget(event.target)) {
        resetBuffer();
        return;
      }

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

          // Only block keys once the burst is long enough to be a real scan,
          // and only on qty/price/other non-text fields (not free-text — handled above).
          if (
            targetIsOtherEditable
            && bufferRef.current.length >= SCAN_MIN_LENGTH
            && looksLikeBarcodePayload(bufferRef.current)
          ) {
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
        if (!looksLikeBarcodePayload(barcode)) return;

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

    document.addEventListener('compositionstart', onCompositionStart, true);
    document.addEventListener('compositionend', onCompositionEnd, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('compositionstart', onCompositionStart, true);
      document.removeEventListener('compositionend', onCompositionEnd, true);
      document.removeEventListener('keydown', onKeyDown, true);
      clearIdle();
    };
  }, []);
}
