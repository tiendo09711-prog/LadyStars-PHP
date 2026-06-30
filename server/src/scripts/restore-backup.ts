import fs from 'fs';
import path from 'path';
import { connectDatabase } from '../config/database.js';
import { EJSON } from 'bson';
import mongoose from 'mongoose';

async function restoreBackup(backupDir: string) {
  await connectDatabase();
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found in: ' + backupDir);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const db = mongoose.connection.db!;
  const results: Array<{ collection: string; inserted: number }> = [];

  for (const entry of manifest.collections) {
    const file = path.join(backupDir, entry.file);
    if (!fs.existsSync(file)) {
      console.log('[restore] skip (file missing): ' + entry.collection);
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const docs = EJSON.parse(raw) as any[];
    if (!docs.length) {
      results.push({ collection: entry.collection, inserted: 0 });
      continue;
    }
    const exists = await db.listCollections({ name: entry.collection }).hasNext();
    if (exists) await db.collection(entry.collection).deleteMany({});
    const res = await db.collection(entry.collection).insertMany(docs, { ordered: false });
    results.push({ collection: entry.collection, inserted: res.insertedCount });
  }

  console.log('[restore] done');
  for (const r of results) console.log(' - ' + r.collection + ': ' + r.inserted);
  await mongoose.disconnect();
}

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run restore-backup -- <backupDir>');
  process.exit(1);
}

restoreBackup(path.resolve(dir)).catch(async (error) => {
  console.error('[restore] failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});