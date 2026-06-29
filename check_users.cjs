require('dotenv').config({ path: require('path').join(process.cwd(), '.env.e2e.local') });
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient(process.env.E2E_MONGO_URI);
  await client.connect();
  const db = client.db(process.env.E2E_MONGO_DB_NAME);
  const users = await db.collection('users').find({}, { projection: { name:1, email:1, role:1, isActive:1, status:1, isRootOwner:1, deletedAt:1, passwordHash:1 } }).limit(10).toArray();
  console.log(JSON.stringify(users.map(u => ({ name:u.name, email:u.email, role:u.role, isActive:u.isActive, status:u.status, isRootOwner:u.isRootOwner, deletedAt:u.deletedAt, hasHash:!!u.passwordHash })), null, 2));
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
