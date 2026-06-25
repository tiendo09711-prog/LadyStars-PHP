import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = path.join(root, 'e2e');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.e2e.local'), override: false });

const required = ['MONGO_URI', 'E2E_MONGO_URI', 'E2E_MONGO_DB_NAME', 'E2E_API_BASE_URL', 'E2E_BASE_URL', 'E2E_AUTH_EMAIL', 'E2E_AUTH_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`[E2E] Missing ${key}`);
}

if (process.env.E2E_MONGO_DB_NAME !== 'ladystars_e2e') throw new Error('[E2E] E2E_MONGO_DB_NAME must be ladystars_e2e');
if (process.env.E2E_MONGO_URI === process.env.MONGO_URI) throw new Error('[E2E] E2E_MONGO_URI must not equal MONGO_URI');
if (!String(process.env.E2E_MONGO_URI).includes('ladystars_e2e')) throw new Error('[E2E] E2E_MONGO_URI must target ladystars_e2e');

const SPEC = process.env.E2E_SPEC || 'tests/dashboard-audit.spec.ts';

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function waitFor(url, label, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2500, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`[E2E] Timeout waiting for ${label}`);
}

function spawnChild(command, args, env, label) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) console.error(`[${label}] exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
  });
  return child;
}

let shuttingDown = false;
const children = [];
function killTree(child) {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch { /* ignore */ }
}
async function stopChildren() {
  shuttingDown = true;
  for (const child of children) killTree(child);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

async function verifyE2EDatabase() {
  const client = new MongoClient(process.env.E2E_MONGO_URI);
  await client.connect();
  const db = client.db(process.env.E2E_MONGO_DB_NAME);
  await db.admin().ping();
  await client.close();
}

try {
  if (!fs.existsSync(path.join(root, '.env.e2e.local'))) throw new Error('[E2E] .env.e2e.local is required');
  if (!(await portFree(4100))) throw new Error('[E2E] Port 4100 is busy; not killing user process');
  if (!(await portFree(5174))) throw new Error('[E2E] Port 5174 is busy; not killing user process');
  await verifyE2EDatabase();
  console.log(`[E2E] Using DB ladystars_e2e, backend 4100, frontend 5174, spec ${SPEC}`);

  children.push(spawnChild('npm.cmd', ['run', 'dev', '-w', 'server'], {
    PORT: '4100',
    MONGO_URI: process.env.E2E_MONGO_URI,
    CLIENT_URL: 'http://localhost:5174',
    NODE_ENV: 'development',
  }, 'server-e2e'));

  children.push(spawnChild('npm.cmd', ['run', 'dev', '-w', 'client', '--', '--port', '5174'], {
    VITE_API_URL: 'http://localhost:4100/api',
  }, 'client-e2e'));

  await waitFor('http://localhost:4100/health', 'backend E2E');
  await waitFor('http://localhost:5174', 'frontend E2E');

  const result = await new Promise((resolve) => {
    const child = spawn('npx.cmd', ['playwright', 'test', SPEC, '--project=chromium', '--workers=1', '--reporter=list'], {
      cwd: e2eDir,
      env: { ...process.env },
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = result;
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await stopChildren();
}