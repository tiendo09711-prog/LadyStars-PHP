# Live-Guarded Test Mode

Ch? ?? ch?y E2E ghi tr?c ti?p v?o MongoDB ch?nh, c? nhi?u l?p b?o v? ?? tr?nh
ph? d? li?u th?t. T?i li?u n?y m? t? c?ch b?t, c?ch ch?y v? c?c gi?i h?n.

## Khi n?o ???c d?ng

- Ch? khi user ghi r? trong prompt: "cho ph?p live DB test".
- Ch? ch?y spec n?m trong `e2e/live/`. Legacy `e2e/tests/` b? t? ch?i v? c?n
  d?ng `deleteMany`, `dropDatabase`, update Store Settings, upsert admin v?
  helper t?ng hardcode port 4000.

## ?i?u ki?n b?t bu?c (consent gate)

Live mode ch? ch?y khi c? ??:

- File `.env.live-test.local` ? repo root.
- `LIVE_TEST_MODE=true`
- `LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES`
- Backup th?nh c?ng tr??c khi test.
- M?t spec thu?c `e2e/live/`.
- `E2E_RUN_ID` duy nh?t (runner t? sinh).

### V? d? `.env.live-test.local` (KH?NG commit)

```
LIVE_TEST_MODE=true
LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES
E2E_MONGO_URI=mongodb+srv://<user>:<pass>@<host>/<db>?<options>
E2E_MONGO_DB_NAME=<db>
E2E_API_BASE_URL=http://localhost:4100/api
E2E_BASE_URL=http://localhost:5174
E2E_AUTH_EMAIL=<isolated .test or e2e-marked account>
E2E_AUTH_PASSWORD=<strong-local-password>
```

File n?y ?? n?m trong `.gitignore`.

## L?nh

```
npm.cmd run live:preflight                 # ki?m tra consent + m?i tr??ng
npm.cmd run live:test -- --spec e2e/live/sample-live-safe.spec.ts
npm.cmd run live:report                    # in report JSON m?i nh?t
node e2e/run-live-guarded.mjs --help
node e2e/run-live-guarded.mjs --preflight --no-db
```

## Lu?ng c?a runner (`e2e/run-live-guarded.mjs`)

1. ??c `.env.live-test.local` (kh?ng in n?i dung).
2. Ki?m tra 3 bi?n consent.
3. Sinh `runId` d?ng `live-e2e-YYYYMMDD-HHMMSS-random`.
4. Ch?y snapshot backup tr??c. Backup fail => d?ng, kh?ng test.
5. Ch? nh?n `--spec` trong `e2e/live/`; t? ch?i m?i path `e2e/tests/`.
6. Spawn backend port 4100 (MONGO_URI = E2E_MONGO_URI) v? frontend 5174.
7. Truy?n `E2E_RUN_ID` v? `E2E_LIVE=1` cho Playwright.
8. D?ng ??ng c?c process do runner spawn.
9. Ghi report JSON v?o `artifacts/live-test-reports/<run-id>.json`.
10. Kh?ng bao gi? t? restore database khi test fail.

## Backup (`server/src/scripts/live-db-snapshot.mjs`)

- Ghi ra `artifacts/live-db-backups/<run-id>/`.
- M?i collection: `<name>.ejson` (d? li?u EJSON) + `<name>.indexes.json` (index).
- `manifest.json`: runId, th?i ?i?m, t?n DB, s? collection, t?ng document.
- Kh?ng in/ghi Mongo URI, password, token hay secret.
- Kh?ng t? restore.

## Live-safe test context (`e2e/utils/live-test-context.ts`)

M?i test trong `e2e/live/` ph?i d?ng helper n?y. N? b?t bu?c:

- D? li?u t?o ra ???c g?n marker `E2E_RUN_ID` (field `e2eRunId`).
- Cleanup ch? x?a ??ng `_id` ?? t?o/??ng k? trong l?n ch?y.
- C?m `deleteMany({})`, `updateMany({})`, `dropDatabase()`.
- C?m s?a Store Settings global (collection `storesettings`).
- C?m upsert/s?a t?i kho?n admin ho?c root owner.
- C?m d?ng d? li?u th?t c? s?n l?m fixture ghi ??.
- C?m g?i API c?ng 4000.

N?u kh?ng th? c? l?p, n?m `LiveTestNotIsolatableError` v? verdict l?
`BLOCKED_LIVE_TEST_NOT_ISOLATABLE`.

## Report JSON

M?i l?n ch?y ghi: `runId`, `backupPath`, `spec`, `exitCode`, `durationMs`,
`ports`, `collectionCountBefore/After`, `fixtureIds`, `warnings`, `verdict`.

## Gi?i h?n ?? bi?t

- Runner v? snapshot ch?a ???c ch?y th?t v?i DB trong task setup n?y.
- Restore ph?i l?m th? c?ng t? th? m?c backup EJSON; kh?ng c? l?nh auto-restore.
- Snapshot ??c to?n b? document v?o b? nh?; DB r?t l?n c? th? t?n RAM.
- Live mode t?i ?a 2 v?ng test/s?a cho m?i task.
