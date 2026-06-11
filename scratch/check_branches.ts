import mongoose from 'mongoose';
import { Branch } from '../server/src/core/org/branch.model.js';
import dotenv from 'dotenv';

async function main() {
  dotenv.config({ path: '.env' });
  const uri = process.env.MONGO_URI || '';
  await mongoose.connect(uri);
  const branches = await Branch.find();
  console.log(branches);
  process.exit(0);
}

main();
