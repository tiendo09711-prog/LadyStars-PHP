import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runSnapshot, verifySnapshotIntegrity } from '../server/src/scripts/live-db-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = path.join(root, 'e2e');
const liveDir = path.join(e2eDir, 'live');
const reportsDir = path.join(root, 'artifacts', 'live-test-reports');
const backupsRoot = path.join(root, 'artifacts', 'live-db-backups');

const CONSENT = {
  LIVE_TEST_MODE: 'true',
  LIVE_TEST_ACK: 'I_ACCEPT_LIVE_DATABASE_WRITES',
};
const BACKEND_PORT = 4100;
const FRONTEND_PORT = 5174;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i += 1; }
      else { args[key] = true; }
    } else { args._.push(token); }
  }
  return args;
}

function printHelp() {
  const text = [
    'live-guarded E2E runner',
    '',
    'Usage:',
    '  node e2e/run-live-guarded.mjs --help',
    '  node e2e/run-live-guarded.mjs --preflight [--no-db]',
    '  node e2e/run-live-guarded.mjs --spec e2e/live/<name>.spec.ts',
    '  node e2e/run-live-guarded.mjs --latest-report',
    '',
    'Guards:',
    '  - Requires .env.live-test.local with LIVE_TEST_MODE=true and',
    '    LIVE_TEST_ACK=I_ACCEPT_LIVE_DATABASE_WRITES.',
    '  - Requires E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD (not printed).',
    '  - Only runs specs inside e2e/live/. Legacy e2e/tests/ specs are refused.',
    '  - Takes a Mongo snapshot before any test; aborts if backup fails.',
    '  - Spawns isolated backend on ' + BACKEND_PORT + ' and frontend on ' + FRONTEND_PORT + '.',
    '  - Always cleans up spawned processes (finally + SIGINT/SIGTERM).',
    '  - Never restores the database automatically.',
    '',
    'Flags:',
    '  --help            Show this help and exit (no DB, no spawn).',
    '  --preflight       Validate consent + environment only.',
    '  --no-db           With --preflight: skip any DB connection/snapshot checks.',
    '  --spec <path>     Live spec to run (must be under e2e/live/).',
    '  --latest-report   Print the newest report JSON path and summary.',
  ].join('\n');
  console.log(text);
}

function loadEnv() {
  dotenv.config({ path: path.join(root, '.env.live-test.local'), override: true });
  dotenv.config({ path: path.join(root, '.env.e2e.local'), override: false });
  dotenv.config({ path: path.join(root, '.env'), override: false });
}

function checkConsent() {
  const problems = [];
  if (!fs.existsSync(path.join(root, '.env.live-test.local'))) {
    problems.push('.env.live-test.local is required');
  }
  for (const [key, expected] of Object.entries(CONSENT)) {
    if (process.env[key] !== expected) problems.push('Missing/invalid consent: ' + key);
  }
  return problems;
}

function checkAuthCredentials() {
  const problems = [];
  if (!process.env.E2E_AUTH_EMAIL || !process.env.E2E_AUTH_EMAIL.trim()) {
    problems.push('E2E_AUTH_EMAIL is missing or empty');
  }
  if (!process.env.E2E_AUTH_PASSWORD || !process.env.E2E_AUTH_PASSWORD.trim()) {
    problems.push('E2E_AUTH_PASSWORD is missing or empty');
  }
  return problems;
}

function makeRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  const rand = Math.random().toString(36).slice(2, 8);
  return 'live-e2e-' + stamp + '-' + rand;
}

function normalizeSpec(spec) {
  if (!spec || spec === true) throw new Error('--spec <path> is required');
  const abs = path.resolve(root, spec);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel.startsWith('e2e/tests/') || rel.includes('/tests/')) {
    throw new Error('Refusing legacy spec under e2e/tests/. Live mode only runs e2e/live/.');
  }
  if (!rel.startsWith('e2e/live/')) {
    throw new Error('Spec must be inside e2e/live/. Got: ' + rel);
  }
  if (!fs.existsSync(abs)) throw new Error('Spec not found: ' + rel);
  return { abs, rel };
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

function isPortListening(port) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
    const re = new RegExp(':\\s*' + port + '\\s.*LISTENING', 'i');
    return re.test(out);
  } catch {
    return false;
  }
}

function waitFor(url, label, timeoutMs = 90000) {
  return new Promise(async (resolve, reject) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ok = await new Promise((res) => {
        const req = http.get(url, (r) => { r.resume(); res(Boolean(r.statusCode && r.statusCode < 500)); });
        req.on('error', () => res(false));
        req.setTimeout(2500, () => { req.destroy(); res(false); });
      });
      if (ok) return resolve();
      await new Promise((r) => setTimeout(r, 1000));
    }
    reject(new Error('[live] Timeout waiting for ' + label));
  });
}

// --- Process tree management ---
let shuttingDown = false;
const children = [];
const childInfo = []; // { label, pid, command }

function spawnChild(command, args, env, label) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], shell: command.endsWith('.cmd') || process.platform === 'win32' });
  child.stdout.on('data', (c) => process.stdout.write('[' + label + '] ' + c));
  child.stderr.on('data', (c) => process.stderr.write('[' + label + '] ' + c));
  child.on('exit', (code, signal) => { if (!shuttingDown && code !== 0) console.error('[' + label + '] exited code ' + (code ?? 'null') + ' signal ' + (signal ?? 'null')); });
  children.push(child);
  childInfo.push({ label, pid: child.pid, command: command + ' ' + args.join(' ') });
  return child;
}

function killProcessTree(pid) {
  // On Windows, taskkill /T kills the entire process tree rooted at pid.
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore', timeout: 10000 });
      return true;
    } catch {
      try { process.kill(pid); } catch {}
      return false;
    }
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
    return true;
  }
}

async function stopChildren() {
  shuttingDown = true;
  // Kill process trees in reverse order (frontend first, then backend).
  const infoReversed = [...childInfo].reverse();
  for (const info of infoReversed) {
    if (info.pid) killProcessTree(info.pid);
  }
  // Also signal child objects directly.
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode) return resolve();
    child.once('exit', resolve);
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => resolve(), 3000).unref();
  })));
  // Wait briefly for OS to release ports.
  await new Promise((r) => setTimeout(r, 2000));
}

async function verifyPortsClean() {
  const backendListening = isPortListening(BACKEND_PORT);
  const frontendListening = isPortListening(FRONTEND_PORT);
  return {
    backendFree: !backendListening,
    frontendFree: !frontendListening,
    backendListening,
    frontendListening,
  };
}

async function collectionCount(uriEnv) {
  const { MongoClient } = await import('mongodb');
  const uri = process.env[uriEnv] || process.env.MONGO_URI;
  const client = new MongoClient(uri);
  await client.connect();
  try {
    // Derive DB name from the URI itself, not from E2E_MONGO_DB_NAME,
    // so collectionCount targets the same database as the snapshot.
    const dbName = (() => { try { return new URL(uri).pathname.replace(/^\//, '') || undefined; } catch { return undefined; } })();
    const cols = await client.db(dbName).listCollections({}, { nameOnly: true }).toArray();
    return cols.length;
  } finally { await client.close(); }
}

function writeReport(report) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, report.runId + '.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), { encoding: 'utf8' });
  return file;
}

function latestReport() {
  if (!fs.existsSync(reportsDir)) { console.log('No reports yet.'); return 0; }
  const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: fs.statSync(path.join(reportsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) { console.log('No reports yet.'); return 0; }
  const file = path.join(reportsDir, files[0].f);
  console.log('Latest report: ' + file);
  console.log(fs.readFileSync(file, 'utf8'));
  return 0;
}

async function preflight(noDb) {
  loadEnv();
  const problems = checkConsent();
  const authProblems = checkAuthCredentials();
  console.log('[live] preflight consent: ' + (problems.length ? 'FAIL' : 'OK'));
  for (const p of problems) console.log('  - ' + p);
  console.log('[live] preflight auth credentials: ' + (authProblems.length ? 'FAIL' : 'OK (present, not printed)'));
  for (const p of authProblems) console.log('  - ' + p);
  console.log('[live] backend port: ' + BACKEND_PORT + ', frontend port: ' + FRONTEND_PORT);
  console.log('[live] live spec dir: e2e/live/ (exists: ' + fs.existsSync(liveDir) + ')');
  const ports = await verifyPortsClean();
  console.log('[live] port 4100 ' + (ports.backendFree ? 'free' : 'BUSY') + ', port 5174 ' + (ports.frontendFree ? 'free' : 'BUSY'));
  const allProblems = [...problems, ...authProblems];
  if (noDb) {
    console.log('[live] --no-db set: skipping all DB connection/snapshot checks.');
    return allProblems.length ? 1 : 0;
  }
  console.log('[live] (DB checks would run here; omitted unless --no-db is absent and consent passes)');
  return allProblems.length ? 1 : 0;
}

async function runLive(specArg) {
  loadEnv();
  const startedAt = new Date();
  const runId = makeRunId();
  const warnings = [];
  const report = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    spec: null,
    backupPath: null,
    exitCode: 1,
    durationMs: null,
    ports: { backend: BACKEND_PORT, frontend: FRONTEND_PORT },
    collectionCountBefore: null,
    collectionCountAfter: null,
    fixtureIds: [],
    snapshotIntegrity: null,
    spawnedProcesses: [],
    cleanup: null,
    postCleanupPorts: null,
    warnings,
    verdict: 'BLOCKED',
  };

  // 0) Consent gate
  const consentProblems = checkConsent();
  if (consentProblems.length) {
    report.warnings.push(...consentProblems);
    report.verdict = 'BLOCKED';
    const file = writeReport(report);
    console.error('[live] consent gate failed. See ' + file);
    return 1;
  }

  // 0b) Auth credentials gate
  const authProblems = checkAuthCredentials();
  if (authProblems.length) {
    report.warnings.push(...authProblems);
    report.verdict = 'BLOCKED_MISSING_E2E_AUTH';
    const file = writeReport(report);
    console.error('[live] auth credentials gate failed (BLOCKED_MISSING_E2E_AUTH). See ' + file);
    return 1;
  }

  // 0c) Spec validation
  let spec;
  try { spec = normalizeSpec(specArg); } catch (err) {
    report.warnings.push(err.message);
    if (/legacy/.test(err.message)) report.verdict = 'BLOCKED';
    writeReport(report);
    console.error('[live] ' + err.message);
    return 1;
  }
  report.spec = spec.rel;

  // 0d) Port availability (do NOT kill user processes)
  if (!(await portFree(BACKEND_PORT))) { report.warnings.push('Port ' + BACKEND_PORT + ' busy'); writeReport(report); console.error('[live] Port ' + BACKEND_PORT + ' busy; not killing user process'); return 1; }
  if (!(await portFree(FRONTEND_PORT))) { report.warnings.push('Port ' + FRONTEND_PORT + ' busy'); writeReport(report); console.error('[live] Port ' + FRONTEND_PORT + ' busy; not killing user process'); return 1; }

  // 1) Backup BEFORE any test. Abort if it fails.
  try {
    const snap = await runSnapshot({ runId, repoRoot: root, uriEnv: 'MONGO_URI' });
    report.backupPath = snap.outDir;
    report.collectionCountBefore = snap.manifest.collectionCount;
    console.log('[live] backup OK: ' + snap.outDir);
    // 2) Verify snapshot integrity before any test.
    try {
      const integrity = verifySnapshotIntegrity(snap.outDir);
      console.log('[live] integrity OK collections=' + integrity.collectionCount + ' docs=' + integrity.totalDocuments);
      report.snapshotIntegrity = 'PASS';
    } catch (integrityErr) {
      report.warnings.push('Snapshot integrity FAILED: ' + (integrityErr && integrityErr.message ? integrityErr.message : String(integrityErr)));
      report.snapshotIntegrity = 'FAIL';
      report.verdict = 'BLOCKED';
      const file = writeReport(report);
      console.error('[live] Snapshot integrity failed; refusing to run tests. See ' + file);
      return 1;
    }
  } catch (err) {
    report.warnings.push('Backup failed: ' + (err && err.message ? err.message : String(err)));
    report.verdict = 'BLOCKED';
    const file = writeReport(report);
    console.error('[live] Backup failed; refusing to run tests. See ' + file);
    return 1;
  }

  process.env.E2E_RUN_ID = runId;

  // SIGINT/SIGTERM handler ? always cleanup.
  let sigintReceived = false;
  const signalHandler = async (sig) => {
    if (sigintReceived) return;
    sigintReceived = true;
    console.error('[live] received ' + sig + '; cleaning up spawned processes...');
    report.warnings.push('Interrupted by ' + sig);
    try { await stopChildren(); } catch {}
    const ports = await verifyPortsClean();
    report.postCleanupPorts = ports;
    report.cleanup = ports.backendFree && ports.frontendFree ? 'PASS' : 'FAIL';
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startedAt.getTime();
    writeReport(report);
    process.exit(1);
  };
  process.on('SIGINT', () => signalHandler('SIGINT'));
  process.on('SIGTERM', () => signalHandler('SIGTERM'));

  try {
    spawnChild('npm.cmd', ['run', 'dev', '-w', 'server'], { PORT: String(BACKEND_PORT), MONGO_URI: process.env.MONGO_URI, CLIENT_URL: 'http://localhost:' + FRONTEND_PORT, NODE_ENV: 'development' }, 'server-live');
    spawnChild('npm.cmd', ['run', 'dev', '-w', 'client', '--', '--port', String(FRONTEND_PORT)], { VITE_API_URL: 'http://localhost:' + BACKEND_PORT + '/api' }, 'client-live');
    report.spawnedProcesses = childInfo.map((c) => ({ label: c.label, pid: c.pid, command: c.command }));
    console.log('[live] spawned: ' + JSON.stringify(report.spawnedProcesses));

    await waitFor('http://localhost:' + BACKEND_PORT + '/health', 'backend live');
    await waitFor('http://localhost:' + FRONTEND_PORT, 'frontend live');

    const code = await new Promise((resolve) => {
      const child = spawn('npx.cmd', ['playwright', 'test', spec.rel.replace(/^e2e\//, ''), '--project=chromium', '--workers=1', '--reporter=list'], { cwd: e2eDir, env: { ...process.env, E2E_RUN_ID: runId, E2E_LIVE: '1' }, stdio: 'inherit', shell: process.platform === 'win32' });
      child.on('exit', (c) => resolve(c ?? 1));
    });
    report.exitCode = code;
    report.verdict = code === 0 ? 'COMPLETE' : 'BLOCKED';
  } catch (err) {
    report.warnings.push(err && err.message ? err.message : String(err));
    report.verdict = 'BLOCKED';
  } finally {
    // ALWAYS cleanup, even on failure/timeout/exception.
    try { await stopChildren(); } catch (e) { report.warnings.push('stopChildren error: ' + (e && e.message ? e.message : String(e))); }
    try { report.collectionCountAfter = await collectionCount('MONGO_URI'); } catch (e) { report.warnings.push('post-count failed: ' + (e && e.message ? e.message : e)); }
    const ports = await verifyPortsClean();
    report.postCleanupPorts = ports;
    report.cleanup = (ports.backendFree && ports.frontendFree) ? 'PASS' : 'FAIL';
    // Cannot report COMPLETE if ports are still bound by runner leftovers.
    if (report.verdict === 'COMPLETE' && report.cleanup !== 'PASS') {
      report.verdict = 'BLOCKED';
      report.warnings.push('Cleanup FAIL: port(s) still listening after stopChildren');
    }
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startedAt.getTime();
    if (report.verdict !== 'COMPLETE') report.warnings.push('Test did not pass; database NOT auto-restored. Inspect backup at ' + report.backupPath);
    const file = writeReport(report);
    console.log('[live] cleanup: ' + report.cleanup);
    console.log('[live] post-cleanup ports: backend ' + (ports.backendFree ? 'free' : 'BUSY') + ', frontend ' + (ports.frontendFree ? 'free' : 'BUSY'));
    console.log('[live] report: ' + file);
  }
  return report.exitCode;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return 0; }
  if (args['latest-report']) { return latestReport(); }
  if (args.preflight) { return preflight(Boolean(args['no-db'])); }
  return runLive(args.spec);
}

main().then((code) => { process.exitCode = code ?? 0; }).catch((err) => { console.error(err && err.message ? err.message : err); process.exitCode = 1; });
