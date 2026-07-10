#!/usr/bin/env python3
"""One-shot UI densify for empty report stub pages — presentational only."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1] / "src" / "modules" / "reports"


def transform(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8-sig")
    if "padding: '24px'" not in text and 'padding: "24px"' not in text:
        return False
    if "Trang đang trống" not in text:
        return False

    title_m = re.search(r"<h2>([^<]+)</h2>", text)
    title = title_m.group(1).strip() if title_m else path.stem

    fn_m = re.search(r"export function (\w+)", text)
    fname = fn_m.group(1) if fn_m else path.stem

    extra_m = re.search(
        r"<p>Trang đang trống, chờ xây dựng\.</p>\s*(.*?)\s*</div>\s*\)\s*;",
        text,
        re.S,
    )
    extra = (extra_m.group(1).strip() if extra_m else "") or ""

    extra_block = f"\n        {extra}" if extra else ""

    new = f'''export function {fname}() {{
  return (
    <div className="compact-page report-placeholder-page">
      <section className="compact-toolbar-card">
        <div className="compact-header">
          <span className="compact-badge">REPORT</span>
          <h1 className="compact-title">{title}</h1>
          <p className="compact-desc">Trang đang trống, chờ xây dựng.</p>
        </div>
      </section>
      <section className="compact-table-card" style={{{{ padding: '14px 16px' }}}}>
        <p style={{{{ margin: 0, fontSize: 13, color: '#64748b' }}}}>
          Nội dung báo cáo sẽ được bổ sung sau. Giao diện đã đồng bộ compact inventory.
        </p>{extra_block}
      </section>
    </div>
  );
}}
'''
    path.write_text(new, encoding="utf-8")
    return True


def main() -> None:
    updated = 0
    for path in sorted(ROOT.glob("*Page.tsx")):
        if transform(path):
            updated += 1
            print(f"updated {path.name}")
    print(f"done: {updated} files")


if __name__ == "__main__":
    main()
