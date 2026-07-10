#!/usr/bin/env python3
from pathlib import Path

REPLACEMENTS = [
    ('className="workspace-page warehouse-records warehouse-audit-admin"',
     'className="workspace-page warehouse-records warehouse-audit-admin compact-page"'),
    ('className="workspace-page warehouse-records"',
     'className="workspace-page warehouse-records compact-page"'),
    ('className="workspace-page wr-transfer-create"',
     'className="workspace-page wr-transfer-create compact-page"'),
    ('className="workspace-page"',
     'className="workspace-page compact-page"'),
]

FILES = [
    "client/src/modules/warehouse/WarehouseTransferPage.tsx",
    "client/src/modules/warehouse/WarehouseTransactionPage.tsx",
    "client/src/modules/warehouse/WarehouseAuditPage.tsx",
    "client/src/modules/warehouse/WarehouseAuditCreatePage.tsx",
    "client/src/modules/warehouse/WarehouseTransferCreatePage.tsx",
    "client/src/modules/warehouse/WarehouseTransferDetailPage.tsx",
    "client/src/modules/warehouse/VoucherImportPage.tsx",
    "client/src/modules/warehouse/VoucherExportPage.tsx",
    "client/src/modules/warehouse/VoucherExcelImportPage.tsx",
    "client/src/modules/warehouse/ProductImportPage.tsx",
    "client/src/modules/warehouse/ProductExportPage.tsx",
    "client/src/modules/warehouse/WarehouseBranchesPage.tsx",
]


def main() -> None:
    for rel in FILES:
        path = Path(rel)
        if not path.exists():
            print("missing", rel)
            continue
        text = path.read_text(encoding="utf-8")
        original = text
        # Apply more-specific replacements first
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        # Avoid double-adding
        text = text.replace("compact-page compact-page", "compact-page")
        if text != original:
            path.write_text(text, encoding="utf-8")
            print("updated", rel)
        else:
            print("no change", rel)


if __name__ == "__main__":
    main()
