import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { env } from '../config/env.js';
import { User } from '../core/auth/user.model.js';
import { ADMIN_ROLE, EMPLOYEE_ROLE } from '../core/auth/role.utils.js';

dotenv.config();

const CANONICAL_ADMIN_EMAIL = 'admin@gmail.com';

type UserSnapshot = {
  _id: string;
  emailMasked: string;
  role: unknown;
  isRootOwner: unknown;
  status: unknown;
  isActive: unknown;
  tokenVersion: unknown;
};

type UserRecord = {
  _id: unknown;
  email?: string;
  name?: string;
  role?: string;
  isRootOwner?: boolean;
  status?: string;
  isActive?: boolean;
  deletedAt?: unknown;
  passwordHash?: string;
  tokenVersion?: number;
};

function getArg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function canonicalizeEmail(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function maskEmail(email?: string) {
  const [local = '', domain = 'unknown'] = String(email || '').split('@');
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

function snapshotUser(user: UserRecord): UserSnapshot {
  return {
    _id: String(user._id),
    emailMasked: maskEmail(user.email),
    role: user.role,
    isRootOwner: user.isRootOwner,
    status: user.status,
    isActive: user.isActive,
    tokenVersion: user.tokenVersion ?? 0,
  };
}

function snapshotPathFor(mode: 'apply' | 'dry-run') {
  const snapshotDir = path.join(os.tmpdir(), 'ladystars-admin-role-snapshots');
  return {
    snapshotDir,
    snapshotPath: path.join(snapshotDir, `users-role-${mode}-${Date.now()}.json`),
  };
}

function ensureSnapshotOutsideRepository(snapshotPath: string) {
  const repoRoot = path.resolve(process.cwd());
  const resolvedSnapshot = path.resolve(snapshotPath);
  return !resolvedSnapshot.toLowerCase().startsWith(repoRoot.toLowerCase());
}

function writeSnapshot(users: UserRecord[], mode: 'apply' | 'dry-run') {
  const { snapshotDir, snapshotPath } = snapshotPathFor(mode);
  if (!ensureSnapshotOutsideRepository(snapshotPath)) {
    throw new Error('Snapshot target is inside repository; aborting.');
  }
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(users.map(snapshotUser), null, 2));
  return snapshotPath;
}

function activeNonDeleted(user: UserRecord) {
  return !user.deletedAt && user.isActive === true;
}

function userNeedsDemotion(user: UserRecord, canonicalId: string) {
  return activeNonDeleted(user)
    && String(user._id) !== canonicalId
    && (user.role !== EMPLOYEE_ROLE || user.isRootOwner !== false);
}

function buildState(users: UserRecord[], canonicalEmail: string) {
  const canonicalMatches = users.filter((user) => canonicalizeEmail(user.email) === canonicalEmail);
  const canonical = canonicalMatches[0];
  const canonicalId = canonical ? String(canonical._id) : '';
  const activeUsers = users.filter(activeNonDeleted);
  const usersToDemote = canonical ? users.filter((user) => userNeedsDemotion(user, canonicalId)) : [];
  const usersUnchanged = canonical
    ? activeUsers.filter((user) => String(user._id) === canonicalId || !userNeedsDemotion(user, canonicalId))
    : activeUsers;

  const canonicalSafe = Boolean(
    canonicalEmail === CANONICAL_ADMIN_EMAIL
    && canonicalMatches.length === 1
    && canonical
    && activeNonDeleted(canonical)
    && !canonical.deletedAt
    && Boolean(canonical.passwordHash)
    && Boolean(canonical._id),
  );

  return {
    canonical,
    canonicalMatches,
    activeUsers,
    activeAdminCount: activeUsers.filter((user) => user.role === ADMIN_ROLE).length,
    activeRootOwnerCount: activeUsers.filter((user) => user.isRootOwner === true).length,
    usersToDemote,
    usersUnchanged,
    canonicalSafe,
  };
}

function printDryRunReport(params: {
  canonicalEmail: string;
  state: ReturnType<typeof buildState>;
  snapshotOutsideRepo: boolean;
  mongoTransactionAvailable: boolean;
  status: 'READY_FOR_EXPLICIT_APPLY' | 'BLOCKED_CANONICAL_ADMIN_NOT_FOUND' | 'BLOCKED_BY_DATA_SAFETY';
}) {
  const { canonicalEmail, state, snapshotOutsideRepo, mongoTransactionAvailable, status } = params;
  const canonical = state.canonical;
  const deleted = canonical ? Boolean(canonical.deletedAt) : false;

  console.log('ADMIN_RECONCILIATION_DRY_RUN_REPORT');
  console.log('');
  console.log('A. Canonical target');
  console.log(`- Email normalized: ${canonicalEmail}`);
  console.log(`- Found exactly one user: ${state.canonicalMatches.length === 1 ? 'Có' : 'Không'}`);
  console.log(`- Active: ${canonical?.isActive === true ? 'Có' : 'Không'}`);
  console.log(`- Deleted: ${deleted ? 'Có' : 'Không'}`);
  console.log(`- PasswordHash present: ${canonical?.passwordHash ? 'Có' : 'Không'}`);
  console.log('');
  console.log('B. Current authorization state');
  console.log(`- Active non-deleted ADMIN count: ${state.activeAdminCount}`);
  console.log(`- Active non-deleted root-owner count: ${state.activeRootOwnerCount}`);
  console.log(`- Canonical current role: ${canonical?.role || '(not found)'}`);
  console.log(`- Canonical current isRootOwner: ${Boolean(canonical?.isRootOwner)}`);
  console.log(`- Users that would be demoted: ${state.usersToDemote.length}`);
  console.log(`- Users that would remain unchanged: ${state.usersUnchanged.length}`);
  console.log('');
  console.log('C. Planned mutation if --apply is explicitly provided');
  console.log('- Collections affected: users only');
  console.log('- User creation/deletion: none');
  console.log('- Fields allowed to change:');
  console.log('  role, isRootOwner, tokenVersion');
  console.log('- Fields forbidden to change:');
  console.log('  email, name, passwordHash, status, isActive, deletedAt,');
  console.log('  branchId, assignedWarehouseIds, defaultWarehouseId');
  console.log('');
  console.log('D. Safety gate');
  console.log(`- Mongo transaction available: ${mongoTransactionAvailable ? 'Có' : 'Không'}`);
  console.log(`- Snapshot target outside repo: ${snapshotOutsideRepo ? 'Có' : 'Không'}`);
  console.log(`- Ready for apply: ${status === 'READY_FOR_EXPLICIT_APPLY' ? 'Có' : 'Không'}`);
  console.log(`- Status: ${status}`);
}

async function loadUsersReadOnly() {
  return User.find({}).lean<UserRecord[]>();
}

async function runDryRun(canonicalEmail: string) {
  await mongoose.connect(env.mongoUri);
  const users = await loadUsersReadOnly();
  const state = buildState(users, canonicalEmail);
  const { snapshotPath } = snapshotPathFor('dry-run');
  const snapshotOutsideRepo = ensureSnapshotOutsideRepository(snapshotPath);
  const mongoTransactionAvailable = Boolean(mongoose.connection.client?.startSession);
  const status = !state.canonicalSafe
    ? 'BLOCKED_CANONICAL_ADMIN_NOT_FOUND'
    : !snapshotOutsideRepo || !mongoTransactionAvailable
      ? 'BLOCKED_BY_DATA_SAFETY'
      : 'READY_FOR_EXPLICIT_APPLY';

  if (snapshotOutsideRepo) {
    writeSnapshot(users, 'dry-run');
  }
  printDryRunReport({ canonicalEmail, state, snapshotOutsideRepo, mongoTransactionAvailable, status });
  await mongoose.disconnect();
  if (status !== 'READY_FOR_EXPLICIT_APPLY') process.exit(1);
}

async function runApply(canonicalEmail: string) {
  if (canonicalEmail !== CANONICAL_ADMIN_EMAIL) {
    throw new Error('BLOCKED_CANONICAL_ADMIN_NOT_FOUND');
  }

  await mongoose.connect(env.mongoUri);
  const users = await loadUsersReadOnly();
  const state = buildState(users, canonicalEmail);
  if (!state.canonicalSafe || !state.canonical) {
    throw new Error('BLOCKED_CANONICAL_ADMIN_NOT_FOUND');
  }

  const snapshotPath = writeSnapshot(users, 'apply');
  console.log('SNAPSHOT written outside repo:', snapshotPath);

  const canonicalId = String(state.canonical._id);
  const session = await mongoose.startSession();
  let demotedCount = 0;
  await session.withTransaction(async () => {
    const demoteResult = await User.updateMany(
      {
        _id: { $ne: state.canonical?._id },
        deletedAt: { $exists: false },
        isActive: true,
        $or: [
          { role: { $ne: EMPLOYEE_ROLE } },
          { isRootOwner: { $ne: false } },
        ],
      },
      {
        $set: { role: EMPLOYEE_ROLE, isRootOwner: false },
        $inc: { tokenVersion: 1 },
      },
      { session },
    );
    demotedCount = demoteResult.modifiedCount;

    await User.updateOne(
      { _id: state.canonical?._id, deletedAt: { $exists: false }, isActive: true },
      {
        $set: { role: ADMIN_ROLE, isRootOwner: true },
        $inc: { tokenVersion: 1 },
      },
      { session },
    );
  });
  await session.endSession();

  const afterUsers = await loadUsersReadOnly();
  const afterState = buildState(afterUsers, canonicalEmail);
  const canonicalAfter = afterState.canonical;
  const otherBadCount = afterUsers.filter((user) => activeNonDeleted(user)
    && String(user._id) !== canonicalId
    && (user.role !== EMPLOYEE_ROLE || user.isRootOwner !== false)).length;

  console.log('ADMIN_RECONCILIATION_APPLY_REPORT');
  console.log(`- Transaction committed: Có`);
  console.log(`- Users demoted: ${demotedCount}`);
  console.log(`- Active non-deleted ADMIN count: ${afterState.activeAdminCount}`);
  console.log(`- Active non-deleted root-owner count: ${afterState.activeRootOwnerCount}`);
  console.log(`- Canonical role: ${canonicalAfter?.role}`);
  console.log(`- Canonical isRootOwner: ${Boolean(canonicalAfter?.isRootOwner)}`);
  console.log(`- Other active users bad role/root count: ${otherBadCount}`);

  await mongoose.disconnect();

  if (afterState.activeAdminCount !== 1
    || afterState.activeRootOwnerCount !== 1
    || canonicalAfter?.role !== ADMIN_ROLE
    || canonicalAfter?.isRootOwner !== true
    || otherBadCount !== 0) {
    throw new Error('BLOCKED_BY_DATA_SAFETY');
  }
}

async function main() {
  const canonicalEmail = canonicalizeEmail(getArg('email') || process.env.PRIMARY_ADMIN_EMAIL);
  const apply = hasFlag('apply');

  if (canonicalEmail !== CANONICAL_ADMIN_EMAIL) {
    console.log('BLOCKED_CANONICAL_ADMIN_NOT_FOUND');
    process.exit(1);
  }

  if (apply) {
    await runApply(canonicalEmail);
    return;
  }

  await runDryRun(canonicalEmail);
}

main().catch(async (error) => {
  console.error('RECONCILE ERROR:', error.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
