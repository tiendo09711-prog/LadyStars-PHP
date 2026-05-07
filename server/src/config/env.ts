import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/my_erp',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
};
