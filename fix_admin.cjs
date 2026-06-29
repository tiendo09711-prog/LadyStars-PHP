require('dotenv').config({ path: require('path').join(process.cwd(), '.env.e2e.local') });
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.E2E_MONGO_URI);
  await client.connect();
  const db = client.db(process.env.E2E_MONGO_DB_NAME);
  const r = await db.collection('users').deleteOne({ email: 'admin@myerp.local' });
  console.log('deleted admin@myerp.local:', r.deletedCount);
  const count = await db.collection('users').countDocuments({ role: 'ADMIN', isActive: true, deletedAt: { $exists: false } });
  console.log('active admins remaining:', count);
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
