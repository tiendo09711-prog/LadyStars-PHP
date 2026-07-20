import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import './FilterSuggestInput.css';

export type FilterSuggestItem = {
  id: string;
  /** Value written into the input when selected. */
  value: string;
  /** Primary line. */
  label: string;
  /** Secondary line (code, phone, meta…). */
  meta?: string;
};

export type FilterSuggestFetcher = (
  query: string,
  signal: AbortSignal,
) => Promise<FilterSuggestItem[]>;

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'children'
>;

export type FilterSuggestInputProps = NativeInputProps & {
  value: string;
  onChange: (value: string) => void;
  /** Called after a suggestion is chosen (input already updated). */
  onSelectItem?: (item: FilterSuggestItem) => void;
  fetchSuggestions: FilterSuggestFetcher;
  /** Minimum characters before fetching (default 1). */
  minChars?: number;
  debounceMs?: number;
  /** Optional leading icon rendered inside the control. */
  icon?: ReactNode;
  /** Extra class on the outer wrapper. */
  wrapperClassName?: string;
  /** Extra class on the suggestion panel. */
  panelClassName?: string;
  /** When true, wrapper is bare (parent already has search-box layout). */
  bare?: boolean;
  /** Max suggestions to show (default 10). */
  maxItems?: number;
};

type PanelCoords = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'below' | 'above';
};

function mergeClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const PANEL_GAP = 4;
const PANEL_VIEWPORT_PAD = 8;
const PANEL_MAX_HEIGHT = 280;
const PANEL_MIN_WIDTH = 220;

function measurePanel(anchor: HTMLElement): PanelCoords {
  const rect = anchor.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const spaceBelow = viewportH - rect.bottom - PANEL_VIEWPORT_PAD;
  const spaceAbove = rect.top - PANEL_VIEWPORT_PAD;
  const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const placement: 'below' | 'above' = preferBelow ? 'below' : 'above';
  const available = Math.max(120, preferBelow ? spaceBelow : spaceAbove);
  const maxHeight = Math.min(PANEL_MAX_HEIGHT, available);

  let width = Math.max(rect.width, PANEL_MIN_WIDTH);
  width = Math.min(width, Math.max(PANEL_MIN_WIDTH, viewportW - PANEL_VIEWPORT_PAD * 2));

  let left = rect.left;
  if (left + width > viewportW - PANEL_VIEWPORT_PAD) {
    left = Math.max(PANEL_VIEWPORT_PAD, viewportW - PANEL_VIEWPORT_PAD - width);
  }
  if (left < PANEL_VIEWPORT_PAD) left = PANEL_VIEWPORT_PAD;

  const top = preferBelow
    ? rect.bottom + PANEL_GAP
    : Math.max(PANEL_VIEWPORT_PAD, rect.top - PANEL_GAP - maxHeight);

  return { top, left, width, maxHeight, placement };
}

/**
 * Search/filter input with live typeahead suggestions.
 * Dropdown is portaled to document.body with fixed positioning so it floats
 * above sticky toolbars, tabs, cards, and any overflow:hidden ancestors.
 */
export const FilterSuggestInput = forwardRef<HTMLInputElement, FilterSuggestInputProps>(
  function FilterSuggestInput(props, ref) {
    const {
      value,
      onChange,
      onSelectItem,
      fetchSuggestions,
      minChars = 1,
      debounceMs = 250,
      icon,
      wrapperClassName,
      panelClassName,
      bare = false,
      maxItems = 10,
      className,
      disabled,
      onFocus,
      onBlur,
      onKeyDown,
      id: idProp,
      ...rest
    } = props;

    const listId = useId();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLUListElement | null>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<FilterSuggestItem[]>([]);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [fetchError, setFetchError] = useState(false);
    const [coords, setCoords] = useState<PanelCoords | null>(null);
    const blurTimerRef = useRef<number | null>(null);
    const requestSeq = useRef(0);
    const fetchRef = useRef(fetchSuggestions);
    fetchRef.current = fetchSuggestions;

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const closePanel = useCallback(() => {
      setOpen(false);
      setActiveIndex(-1);
      setCoords(null);
    }, []);

    const updateCoords = useCallback(() => {
      const anchor = rootRef.current || inputRef.current;
      if (!anchor) return;
      setCoords(measurePanel(anchor));
    }, []);

    // Debounced fetch while open + enough chars.
    useEffect(() => {
      const query = value.trim();
      if (!open || disabled) {
        return;
      }
      if (query.length < minChars) {
        setItems([]);
        setLoading(false);
        setFetchError(false);
        setActiveIndex(-1);
        return;
      }

      const controller = new AbortController();
      const seq = ++requestSeq.current;
      setLoading(true);
      setFetchError(false);

      const timer = window.setTimeout(() => {
        void fetchRef.current(query, controller.signal)
          .then((next) => {
            if (seq !== requestSeq.current) return;
            setItems(Array.isArray(next) ? next.slice(0, maxItems) : []);
            setActiveIndex(-1);
            setLoading(false);
          })
          .catch((err: unknown) => {
            if (seq !== requestSeq.current) return;
            const canceled =
              controller.signal.aborted
              || (err as { code?: string; name?: string })?.code === 'ERR_CANCELED'
              || (err as { name?: string })?.name === 'CanceledError'
              || (err as { name?: string })?.name === 'AbortError';
            if (canceled) return;
            setItems([]);
            setFetchError(true);
            setLoading(false);
          });
      }, debounceMs);

      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [value, open, disabled, minChars, debounceMs, maxItems]);

    const showPanel =
      open
      && !disabled
      && value.trim().length >= minChars
      && (loading || fetchError || items.length > 0 || !loading);

    // Measure + keep panel aligned with the input (escape overflow clipping).
    useLayoutEffect(() => {
      if (!showPanel) {
        setCoords(null);
        return;
      }
      updateCoords();
    }, [showPanel, value, items.length, loading, updateCoords]);

    useEffect(() => {
      if (!showPanel) return;

      const onReposition = () => updateCoords();
      window.addEventListener('resize', onReposition);
      // Capture scroll from any nested overflow container.
      window.addEventListener('scroll', onReposition, true);
      return () => {
        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
      };
    }, [showPanel, updateCoords]);

    // Click outside: ignore both the input wrapper and the portaled panel.
    useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (rootRef.current?.contains(target)) return;
        if (panelRef.current?.contains(target)) return;
        closePanel();
      };
      document.addEventListener('mousedown', onPointerDown);
      return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open, closePanel]);

    useEffect(() => () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    }, []);

    const pickItem = (item: FilterSuggestItem) => {
      if (blurTimerRef.current != null) {
        window.clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      onChange(item.value);
      onSelectItem?.(item);
      closePanel();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          closePanel();
        }
        return;
      }

      if (!open || (!items.length && !loading)) {
        if (event.key === 'ArrowDown' && value.trim().length >= minChars) {
          event.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => {
          if (!items.length) return -1;
          return current < items.length - 1 ? current + 1 : 0;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => {
          if (!items.length) return -1;
          return current <= 0 ? items.length - 1 : current - 1;
        });
        return;
      }

      if (event.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
        event.preventDefault();
        pickItem(items[activeIndex]);
      }
    };

    const handleFocus = (event: SyntheticEvent<HTMLInputElement>) => {
      onFocus?.(event as never);
      if (!disabled && value.trim().length >= minChars) {
        setOpen(true);
      }
    };

    const handleBlur = (event: SyntheticEvent<HTMLInputElement>) => {
      onBlur?.(event as never);
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = window.setTimeout(() => {
        const active = document.activeElement;
        if (panelRef.current?.contains(active)) return;
        if (rootRef.current?.contains(active)) return;
        closePanel();
      }, 150);
    };

    const panelStyle: CSSProperties | undefined = coords
      ? {
          top: coords.top,
          left: coords.left,
          width: coords.width,
          maxHeight: coords.maxHeight,
        }
      : undefined;

    const panel = showPanel && coords && typeof document !== 'undefined'
      ? createPortal(
          <ul
            ref={panelRef}
            id={listId}
            className={mergeClassNames(
              'filter-suggest__panel',
              'filter-suggest__panel--portal',
              coords.placement === 'above' && 'filter-suggest__panel--above',
              panelClassName,
            )}
            style={panelStyle}
            role="listbox"
            aria-label="Gợi ý"
          >
            {loading && items.length === 0 ? (
              <li className="filter-suggest__status" role="presentation">
                Đang tìm gợi ý…
              </li>
            ) : null}
            {!loading && fetchError ? (
              <li className="filter-suggest__status" role="presentation">
                Không tải được gợi ý
              </li>
            ) : null}
            {!loading && !fetchError && items.length === 0 ? (
              <li className="filter-suggest__status" role="presentation">
                Không có gợi ý phù hợp
              </li>
            ) : null}
            {items.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={mergeClassNames(
                    'filter-suggest__item',
                    index === activeIndex && 'is-active',
                  )}
                  onMouseDown={(event) => {
                    // Keep focus flow predictable; select on click.
                    event.preventDefault();
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pickItem(item)}
                >
                  <span className="filter-suggest__label">{item.label}</span>
                  {item.meta ? (
                    <span className="filter-suggest__meta">{item.meta}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

    return (
      <div
        ref={rootRef}
        className={mergeClassNames(
          'filter-suggest',
          bare && 'filter-suggest--bare',
          Boolean(icon) && 'filter-suggest--has-icon',
          wrapperClassName,
        )}
      >
        {icon ? <span className="filter-suggest__icon" aria-hidden="true">{icon}</span> : null}
        <input
          {...rest}
          id={idProp}
          ref={inputRef}
          type="text"
          className={mergeClassNames('filter-suggest__input', className)}
          value={value}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={
            showPanel && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          onChange={(event) => {
            onChange(event.target.value);
            if (!disabled) setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {panel}
      </div>
    );
  },
);

export default FilterSuggestInput;
