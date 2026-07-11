# BÁO CÁO AUDIT E2E — Trang Bán Sỉ

**Run ID:** `E2E_WS_1783790140333_gp33k0`
**Thời gian:** 2026-07-11T17:15:40.336Z → 2026-07-11T17:16:40.321Z
**URL:** http://localhost:5173/sales-channels/store/wholesale
**Playwright:** 1.51.0
**DB:** ladystars_php @ 127.0.0.1 (mysql), APP_ENV=local
**Isolated:** false
**Safety gate mutating:** YES — BLOCKED

## Counts
- PASS: 1
- FAIL: 1
- BLOCKED_SAFETY_GATE: 0
- BLOCKED: 0
- SKIPPED: 0
- TOTAL: 2

## Bugs
### BUG-WS-001 [CRITICAL] Đăng nhập tài khoản test local
- TC: TC-A00
- Expected: Có token session sau login
- Actual: hasToken=false; url=http://localhost:5173/login
- Notes: Không ghi secret. Role dự kiến ADMIN.

## Matrix
| ID | Name | Group | Status | Mode | Severity |
|---|---|---|---|---|---|
| TC-A01 | Truy cập chưa đăng nhập | A | PASS | live-readonly |  |
| TC-A00 | Đăng nhập tài khoản test local | A | FAIL | live-readonly | CRITICAL |