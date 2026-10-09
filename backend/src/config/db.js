import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

// Cache global: sobrevive entre invocações "quentes" da função serverless.
const cached = global.mongoose ?? (global.mongoose = { conn: null, promise: null, listeners: false });

export async function connectDb() {
  if (!cached.listeners) {
    mongoose.connection.on('error', (err) => console.error('[mongo] erro:', err.message));
    mongoose.connection.on('disconnected', () => {
      console.warn('[mongo] desconectado');
      cached.conn = null;
      cached.promise = null;
    });
    cached.listeners = true;
  }

  if (cached.conn && mongoose.connection.readyState === 1) return cached.coon;
  
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
        bufferCommands: false,
      })
      .then((m) => {
        console.log(`[mongo] conectado ao banco "${m.connection.name}"`);
        return m;
      });
  }

  try {
    cached.coon = await cached.promise;
  } catch (err){
    cached.promise = null;
    cached.conn = null;
    throw err;
  }
  return cached.conn;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
}
