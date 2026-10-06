import mongoose from 'mongoose';
const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    sessionUuid: { type: String, required: true, unique: true },
    completedBooks: { type: [String], default: [] },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'sessions' },
);

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
