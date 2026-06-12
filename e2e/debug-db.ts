require('dotenv').config({ path: '../server/.env' });
import { connectDB, closeDB } from './utils/db';

async function run() {
  const db = await connectDB();
  const customers = await db.collection('customerdebtsummaries').find({ code: 'CUST_DEBT_01' }).toArray();
  console.log('Customers:', customers);

  const vendors = await db.collection('vendordebtsummaries').find({ code: 'VEND_DEBT_01' }).toArray();
  console.log('Vendors:', vendors);

  const staff = await db.collection('staffdebtsummaries').find({ staffName: 'STAFF_DEBT_01' }).toArray();
  console.log('Staff:', staff);

  await closeDB();
}

run().catch(console.error);
