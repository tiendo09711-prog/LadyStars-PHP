import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

const repoRoot = path.resolve(process.cwd(), '..');
dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(repoRoot, '.env.e2e.local'), override: false });

function die(message) {
  throw new Error(message);
}

function mustBeOutsideRepo(targetPath) {
  const resolved = path.resolve(targetPath);
  const repo = path.resolve(repoRoot) + path.sep;
  if (resolved.startsWith(repo)) {
    die(`backup-dir must be outside repo: ${resolved}`);
  }
  return resolved;
}

function isObjectIdLike(value) {
  return typeof value === 'string' && ObjectId.isValid(value);
}

async function main() {
  const mode = String(process.argv[2] || '').trim();
  const backupArg = String(process.argv[3] || '').trim();
  if (!['--backup', '--dry-run', '--apply', '--verify', '--restore'].includes(mode)) {
    die('Usage: node remove-branch-isdefault.mjs --backup|--dry-run|--apply|--verify|--restore <backupDir>');
  }
  if (!backupArg) die('backupDir is required');

  const backupDir = mustBeOutsideRepo(backupArg);
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) die('MONGO_URI is required');

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();
  const branches = db.collection('branches');
  const snapshotPath = path.join(backupDir, 'branches.json');
  const manifestPath = path.join(backupDir, 'manifest.json');
  const checksumPath = path.join(backupDir, 'sha256.txt');

  if (mode === '--backup') {
    fs.mkdirSync(backupDir, { recursive: true });
    const docs = await branches.find({}).toArray();
    fs.writeFileSync(snapshotPath, JSON.stringify(docs, null, 2), 'utf8');
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
    const defaultCount = docs.filter((doc) => doc.isDefault === true).length;
    fs.writeFileSync(checksumPath, `${checksum}  branches.json\n`, 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      branchCount: docs.length,
      defaultCount,
      dbName: db.databaseName,
      files: ['branches.json', 'manifest.json', 'sha256.txt'],
    }, null, 2), 'utf8');
    console.log(JSON.stringify({ backupPath: backupDir, branchCount: docs.length, defaultCount, checksum }));
    await client.close();
    return;
  }

  if (!fs.existsSync(manifestPath) || !fs.existsSync(snapshotPath) || !fs.existsSync(checksumPath)) {
    die('backup files are missing');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
  const recorded = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
  if (checksum !== recorded) die('checksum mismatch');

  const currentCount = await branches.countDocuments({});
  const currentDefaultCount = await branches.countDocuments({ isDefault: true });
  const filter = { isDefault: { $exists: true } };
  const dryCount = await branches.countDocuments(filter);

  if (mode === '--dry-run') {
    console.log(JSON.stringify({ manifest, currentCount, currentDefaultCount, dryCount }));
    await client.close();
    return;
  }

  if (mode === '--apply') {
    const result = await branches.updateMany(filter, { $unset: { isDefault: '' } });
    const afterDefaultCount = await branches.countDocuments({ isDefault: { $exists: true } });
    console.log(JSON.stringify({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, currentCount, afterDefaultCount }));
    await client.close();
    return;
  }

  if (mode === '--verify') {
    const afterCount = await branches.countDocuments({});
    const afterDefaultCount = await branches.countDocuments({ isDefault: { $exists: true } });
    console.log(JSON.stringify({ currentCount, afterCount, afterDefaultCount }));
    await client.close();
    return;
  }

  if (mode === '--restore') {
    const bulk = snapshot.map((doc) => {
      const replacement = { ...doc };
      if (replacement._id && typeof replacement._id === 'string' && isObjectIdLike(replacement._id)) {
        replacement._id = new ObjectId(replacement._id);
      }
      return {
        replaceOne: {
          filter: { _id: replacement._id },
          replacement,
          upsert: true,
        },
      };
    });
    if (bulk.length) await branches.bulkWrite(bulk, { ordered: false });
    console.log(JSON.stringify({ restored: bulk.length }));
    await client.close();
    return;
  }

  await client.close();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
