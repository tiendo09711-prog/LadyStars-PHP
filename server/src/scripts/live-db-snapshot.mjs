#!/usr/bin/env node
/**
 * Live DB snapshot (read-only backup).
 *
 * Dumps every collection of the target Mongo database to EJSON files plus a
 * manifest with collection list, indexes and SHA-256 hashes so integrity can
 * be verified. It NEVER prints the Mongo URI, credentials, tokens or
 * any secret, and it NEVER mutates or restores the database.
 *
 * Usage:
 *   node server/src/scripts/live-db-snapshot.mjs --run-id <id> [--out <dir>] [--uri-env E2E_MONGO_URI]
 *
 * Exit codes: 0 = backup ok, non-zero = failure (caller must abort the test).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i += 1; }
      else { args[key] = true; }
    }
  }
  return args;
}

function redactDbNameFromUri(uri) {
  // Returns ONLY the database name, never the full URI/credentials.
  try { return new URL(uri).pathname.replace(/^\//, '') || ''; } catch { return ''; }
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function runSnapshot(options) {
  const runId = options.runId;
  if (!runId) throw new Error('[snapshot] run-id is required');
  const uriEnv = options.uriEnv || 'E2E_MONGO_URI';
  const uri = process.env[uriEnv] || process.env.MONGO_URI;
  if (!uri) throw new Error('[snapshot] No Mongo URI in env (' + uriEnv + ' / MONGO_URI)');

  const repoRoot = options.repoRoot || process.cwd();
  const outDir = options.outDir || path.join(repoRoot, 'artifacts', 'live-db-backups', runId);
  fs.mkdirSync(outDir, { recursive: true });

  const dbNameFromUri = redactDbNameFromUri(uri);
  const dbName = (uriEnv === 'E2E_MONGO_URI' ? process.env.E2E_MONGO_DB_NAME : null) || dbNameFromUri || undefined;

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const manifestCollections = [];
    for (const info of collections) {
      if (info.type && info.type !== 'collection') continue;
      const name = info.name;
      const coll = db.collection(name);
      const docs = await coll.find({}).toArray();
      const indexes = await coll.indexes();
      const dataFile = path.join(outDir, name + '.ejson');
      fs.writeFileSync(dataFile, EJSON.stringify(docs, undefined, 2), { encoding: 'utf8' });
      const indexFile = path.join(outDir, name + '.indexes.json');
      fs.writeFileSync(indexFile, JSON.stringify(indexes, null, 2), { encoding: 'utf8' });
      const dataHash = sha256File(dataFile);
      const indexHash = sha256File(indexFile);
      manifestCollections.push({
        name,
        count: docs.length,
        indexCount: indexes.length,
        dataFile: path.basename(dataFile),
        indexFile: path.basename(indexFile),
        dataSha256: dataHash,
        indexSha256: indexHash,
      });
    }
    const manifest = {
      runId,
      createdAt: new Date().toISOString(),
      databaseName: dbName || null,
      collectionCount: manifestCollections.length,
      totalDocuments: manifestCollections.reduce((sum, c) => sum + c.count, 0),
      collections: manifestCollections,
      note: 'EJSON snapshot for manual inspection/restore. No URI or secrets stored.',
    };
    const manifestFile = path.join(outDir, 'manifest.json');
    const manifestContent = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestFile, manifestContent, { encoding: 'utf8' });
    const manifestSha256 = createHash('sha256').update(manifestContent).digest('hex');
    return { outDir, manifestFile, manifest, manifestSha256 };
  } finally {
    await client.close();
  }
}

export function verifySnapshotIntegrity(outDir) {
  const manifestFile = path.join(outDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    throw new Error('[integrity] manifest.json not found in ' + outDir);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const errors = [];
  // Verify each collection file hash
  for (const entry of manifest.collections) {
    for (const fileType of ['data', 'index']) {
      const fileName = fileType === 'data' ? entry.dataFile : entry.indexFile;
      const expectedHash = fileType === 'data' ? entry.dataSha256 : entry.indexSha256;
      if (!fileName || !expectedHash) {
        errors.push(entry.name + ': missing ' + fileType + ' file or hash in manifest');
        continue;
      }
      const filePath = path.join(outDir, fileName);
      if (!fs.existsSync(filePath)) {
        errors.push(entry.name + ': ' + fileType + ' file missing (' + fileName + ')');
        continue;
      }
      const actualHash = sha256File(filePath);
      if (actualHash !== expectedHash) {
        errors.push(entry.name + ': ' + fileType + ' hash mismatch (expected ' + expectedHash + ' got ' + actualHash + ')');
      }
    }
  }
  if (errors.length) {
    throw new Error('[integrity] Verification failed:\n' + errors.join('\n'));
  }
  return { ok: true, collectionCount: manifest.collectionCount, totalDocuments: manifest.totalDocuments };
}

const isMain = (() => {
  try { return path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  runSnapshot({ runId: args['run-id'], outDir: args.out, uriEnv: args['uri-env'] })
    .then((res) => {
      console.log('[snapshot] OK collections=' + res.manifest.collectionCount + ' docs=' + res.manifest.totalDocuments);
      console.log('[snapshot] dir=' + res.outDir);
      console.log('[snapshot] manifestSha256=' + res.manifestSha256);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[snapshot] FAILED: ' + (err && err.message ? err.message : err));
      process.exit(1);
    });
}
