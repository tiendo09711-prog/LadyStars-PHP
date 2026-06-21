require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    // Get all branches
    const branches = await db.collection('branches').find({}).sort({ createdAt: -1 }).toArray();
    
    // Get audit logs for branch actions
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const auditLogs = await db.collection('auditlogs').find({
      module: 'branch',
      createdAt: { $gte: fortyEightHoursAgo }
    }).sort({ createdAt: -1 }).toArray();
    
    // Get migration audit
    const migrationAudit = await db.collection('auditlogs').find({
      action: 'branch.migration_backfill'
    }).sort({ createdAt: -1 }).limit(5).toArray();

    console.log(JSON.stringify({
      branches,
      auditLogs,
      migrationAudit,
      stats: {
        totalBranches: branches.length,
        activeBranches: branches.filter(b => b.isActive !== false).length,
        defaultBranches: branches.filter(b => b.isDefault === true).length,
        branchesLast48h: branches.filter(b => b.createdAt >= fortyEightHoursAgo).length
      }
    }, null, 2));
    
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
