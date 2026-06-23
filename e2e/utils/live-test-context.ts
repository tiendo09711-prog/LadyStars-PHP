import { MongoClient, ObjectId, Db } from 'mongodb';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Live-guarded test context.
 *
 * Every test under e2e/live/ MUST go through this helper. It enforces:
 *  - all created data is tagged with the current E2E_RUN_ID marker;
 *  - cleanup only deletes the exact _id values created during this run;
 *  - no deleteMany({}), updateMany({}), dropDatabase(), global store-settings
 *    mutation, or admin/root-owner upsert is ever allowed.
 *
 * If a scenario cannot satisfy these rules, throw LiveTestNotIsolatableError so
 * the runner can report BLOCKED_LIVE_TEST_NOT_ISOLATABLE.
 */

export class LiveTestNotIsolatableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveTestNotIsolatableError';
  }
}

const repoRoot = path.basename(process.cwd()) === 'e2e' ? path.resolve(process.cwd(), '..') : process.cwd();
dotenv.config({ path: path.resolve(repoRoot, '.env.live-test.local'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env'), override: false });

const FORBIDDEN_COLLECTIONS = new Set(['storesettings']);

export type CreatedRef = { collection: string; id: ObjectId };

export interface LiveTestContext {
  runId: string;
  marker: string;
  db: Db;
  /** Insert one document; it is auto-tagged and tracked for cleanup. */
  track<T extends Record<string, unknown>>(collection: string, doc: T): Promise<ObjectId>;
  /** Register an _id created elsewhere (e.g. via API) so cleanup can remove it. */
  register(collection: string, id: string | ObjectId): ObjectId;
  /** Delete only the exact _id values created/registered during this run. */
  cleanup(): Promise<{ collection: string; deleted: number }[]>;
  createdIds(): CreatedRef[];
  close(): Promise<void>;
}

function assertSafeCollection(collection: string) {
  if (FORBIDDEN_COLLECTIONS.has(collection)) {
    throw new LiveTestNotIsolatableError(
      `Collection "${collection}" is global/singleton and cannot be mutated in live mode.`,
    );
  }
}

export async function createLiveTestContext(): Promise<LiveTestContext> {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) {
    throw new LiveTestNotIsolatableError('E2E_RUN_ID is required for live tests. Use the live-guarded runner.');
  }
  const uri = process.env.E2E_MONGO_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new LiveTestNotIsolatableError('No Mongo URI available for live test context.');
  }
  const dbName = process.env.E2E_MONGO_DB_NAME || (() => {
    try { return new URL(uri).pathname.replace(/^\//, ''); } catch { return ''; }
  })();

  const marker = runId;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName || undefined);
  const created: CreatedRef[] = [];

  return {
    runId,
    marker,
    db,
    async track(collection, doc) {
      assertSafeCollection(collection);
      const _id = (doc as { _id?: ObjectId })._id instanceof ObjectId ? (doc as { _id: ObjectId })._id : new ObjectId();
      const tagged = { ...doc, _id, e2eRunId: marker };
      await db.collection(collection).insertOne(tagged as never);
      created.push({ collection, id: _id });
      return _id;
    },
    register(collection, id) {
      assertSafeCollection(collection);
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      created.push({ collection, id: objectId });
      return objectId;
    },
    async cleanup() {
      const results: { collection: string; deleted: number }[] = [];
      const byCollection = new Map<string, ObjectId[]>();
      for (const ref of created) {
        const list = byCollection.get(ref.collection) || [];
        list.push(ref.id);
        byCollection.set(ref.collection, list);
      }
      for (const [collection, ids] of byCollection) {
        if (!ids.length) continue;
        // Strictly scoped: only the exact _id values created in this run.
        const res = await db.collection(collection).deleteMany({ _id: { $in: ids } });
        results.push({ collection, deleted: res.deletedCount ?? 0 });
      }
      return results;
    },
    createdIds() {
      return [...created];
    },
    async close() {
      await client.close();
    },
  };
}
