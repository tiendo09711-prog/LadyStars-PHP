#!/usr/bin/env tsx
/**
 * repair-branch-profile.ts
 *
 * Controlled, read-first repair for a single Branch document whose legacy data
 * can break Mongoose full-document re-validation (e.g. invoiceProfile stored as
 * null/string, phone stored as a non-string, name/address wrong type).
 *
 * NEVER touches: code, sales, orders, stock, transfers, users, reports,
 * StoreSettings, auth, roles, permissions. NEVER drops/deletes collections.
 *
 * Usage:
 *   npx.cmd tsx src/scripts/repair-branch-profile.ts --dry-run --branch-code=HCM
 *   npx.cmd tsx src/scripts/repair-branch-profile.ts --apply   --branch-id=<id>
 *
 * Modes: --dry-run (default, read-only, prints redacted diff) | --apply
 * Target: --branch-code=<CODE> (uppercase) | --branch-id=<ObjectId>
 *
 * Safety:
 *  - Reads exactly one matching branch; aborts if 0 or >1 match.
 *  - Only normalizes phone (type/trim) and invoiceProfile (shape).
 *  - name/address only repaired when their type is clearly wrong.
 *  - code is NEVER modified here.
 *  - Prints redacted diff (no secrets; Branch has no credentials).
 *  - After --apply, reads the document back and verifies shape + identity.
 */
import dotenv from 'dotenv';
import { MongoClient, type ObjectId } from 'mongodb';

dotenv.config({ path: '../.env' });
dotenv.config();

const DEFAULT_FOOTER = 'Cảm ơn quý khách đã mua hàng!';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const eq = key.indexOf('=');
      if (eq >= 0) args[key.slice(0, eq)] = key.slice(eq + 1);
      else args[key] = true;
    }
  }
  return args;
}

function trim(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeInvoiceProfile(raw: unknown) {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    displayName: trim(base.displayName),
    templateId: base.templateId === 'retail-a4-classic' ? 'retail-a4-classic' : 'retail-a4-classic',
    footerText: trim(base.footerText) || DEFAULT_FOOTER,
    showBranchName: Boolean(base.showBranchName),
    showCashier: base.showCashier !== false,
    showProductCode: Boolean(base.showProductCode),
    showLogo: Boolean(base.showLogo),
  };
}

function normalizePhone(raw: unknown) {
  // Only fix type/whitespace. Never rewrite a valid phone's format.
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function normalizeStringField(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') return fallback;
  return raw;
}

function redact(doc: Record<string, unknown>) {
  const ip = (doc.invoiceProfile && typeof doc.invoiceProfile === 'object' ? doc.invoiceProfile : {}) as Record<string, unknown>;
  return {
    _id: String(doc._id ?? ''),
    name: doc.name ?? null,
    code: doc.code ?? null,
    isActive: doc.isActive,
    phone: doc.phone ?? null,
    address: doc.address ? '[set]' : null,
    invoiceProfile: {
      displayName: ip.displayName ? '[set]' : '',
      templateId: ip.templateId ?? null,
      footerText: ip.footerText ? '[set]' : '',
      showBranchName: ip.showBranchName,
      showCashier: ip.showCashier,
      showProductCode: ip.showProductCode,
      showLogo: ip.showLogo,
    },
  };
}

function computeChanges(before: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};

  const phone = normalizePhone(before.phone);
  if (phone !== (before.phone ?? '')) changes.phone = phone;

  const desiredProfile = normalizeInvoiceProfile(before.invoiceProfile);
  const beforeProfile =
    before.invoiceProfile && typeof before.invoiceProfile === 'object' && !Array.isArray(before.invoiceProfile)
      ? before.invoiceProfile
      : null;
  if (JSON.stringify(beforeProfile) !== JSON.stringify(desiredProfile)) {
    changes.invoiceProfile = desiredProfile;
  }

  const name = normalizeStringField(before.name, '');
  if (name !== (before.name ?? '')) changes.name = name;

  const address = normalizeStringField(before.address, '');
  if (address !== (before.address ?? '')) changes.address = address;

  return changes;
}

async function main() {
  const args = parseArgs(process.argv);
  const apply = args.apply === true;
  const dryRun = !apply;

  const code = typeof args['branch-code'] === 'string' ? String(args['branch-code']).trim().toUpperCase() : '';
  const id = typeof args['branch-id'] === 'string' ? String(args['branch-id']).trim() : '';

  if (!code && !id) {
    console.error('Missing target. Use --branch-code=<CODE> or --branch-id=<id>.');
    process.exit(2);
  }
  if (code && id) {
    console.error('Provide only one of --branch-code or --branch-id.');
    process.exit(2);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set.');
    process.exit(2);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const dbName = (() => {
      try { return new URL(uri).pathname.replace(/^\//, '') || undefined; } catch { return undefined; }
    })();
    const db = client.db(dbName);
    const coll = db.collection('branches');

    const filter: Record<string, unknown> = code ? { code } : { _id: id as unknown as ObjectId };
    const matches = await coll.find(filter).toArray();

    if (matches.length === 0) {
      console.error('No branch matched the target. Nothing changed.');
      process.exit(3);
    }
    if (matches.length > 1) {
      console.error(`Ambiguous target: ${matches.length} branches matched. Aborting (no changes).`);
      process.exit(3);
    }

    const before = matches[0] as Record<string, unknown>;
    const changes = computeChanges(before);
    const changeKeys = Object.keys(changes);

    console.log('MODE:', apply ? 'APPLY' : 'DRY-RUN');
    console.log('TARGET:', code ? `code=${code}` : `id=${id}`);
    console.log('BEFORE:', JSON.stringify(redact(before)));
    console.log('CHANGES:', changeKeys.length ? JSON.stringify(redact({ ...before, ...changes })) : 'none');

    if (changeKeys.length === 0) {
      console.log('RESULT: no repair needed; branch already has valid phone + invoiceProfile shape.');
      return;
    }

    if (dryRun) {
      console.log('RESULT: dry-run only, no write performed. Re-run with --apply to write.');
      return;
    }

    const res = await coll.updateOne({ _id: before._id }, { $set: changes });
    console.log('WRITE: matched=' + res.matchedCount + ' modified=' + res.modifiedCount);

    const after = (await coll.findOne({ _id: before._id })) as Record<string, unknown> | null;
    if (!after || String(after._id) !== String(before._id)) {
      console.error('VERIFY FAIL: branch identity changed or document missing after write.');
      process.exit(4);
    }
    const remaining = computeChanges(after);
    if (Object.keys(remaining).length > 0) {
      console.error('VERIFY FAIL: document still has normalizable fields:', JSON.stringify(redact({ ...after, ...remaining })));
      process.exit(4);
    }
    console.log('AFTER:', JSON.stringify(redact(after)));
    console.log('VERIFY OK: branch _id preserved, phone + invoiceProfile shape valid.');

    // Audit log (best-effort; written via the same MongoClient, no new dependency).
    try {
      await db.collection('auditlogs').insertOne({
        action: 'branch.repair',
        module: 'branch',
        resource: 'Branch',
        resourceId: String(before._id),
        before: redact(before),
        after: redact(after),
        metadata: { changedFields: changeKeys, via: 'repair-branch-profile.ts' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('AUDIT: branch.repair logged.');
    } catch (err) {
      console.warn('AUDIT: could not write audit log (non-fatal):', (err as Error).message);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('repair-branch-profile failed:', err?.message || err);
  process.exit(1);
});
