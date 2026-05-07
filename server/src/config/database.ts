import mongoose from 'mongoose';
import { env } from './env.js';

function redactMongoUri(uri: string) {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+):([^@]+)@/, '$1:<redacted>@');
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log(`[db] connected: ${redactMongoUri(env.mongoUri)}`);
}
