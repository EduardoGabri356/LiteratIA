import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDb() {
  mongoose.connection.on('error', (err) => console.error('[mongo] erro:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[mongo] desconectado'));
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.log(`[mongo] conectado ao banco "${mongoose.connection.name}"`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
