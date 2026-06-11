const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('ladystars');
  const branches = await db.collection('branches').find().toArray();
  console.log(branches);
  await client.close();
}

main().catch(console.error);
