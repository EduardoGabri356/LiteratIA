import mongoose from 'mongoose';
const { Schema } = mongoose;

const optionSchema = new Schema(
  { optionId: { type: String, required: true }, text: { type: String, required: true } },
  { _id: false },
);

const quoteSchema = new Schema(
  {
    quoteId: { type: String, required: true },
    quote: { type: String, required: true },
    context: String,
    narrativeVoice: String,
    associationQuestion: { type: String, required: true },
    hint: { type: String, default: null }, // preenchido depois (manual ou gerado por IA)
    options: { type: [optionSchema], validate: (v) => v.length >= 2 },
    // SOMENTE servidor. Nunca enviar ao cliente (ver utils/sanitize.js).
    correctOptionId: { type: String, required: true },
  },
  { _id: false },
);

const quotesChallengeSchema = new Schema(
  {
    bookSlug: { type: String, required: true, unique: true },
    quotes: { type: [quoteSchema], validate: (v) => v.length >= 1 },
  },
  { timestamps: true, collection: 'quotes_challenges' },
);

export const QuotesChallenge =
  mongoose.models.QuotesChallenge || mongoose.model('QuotesChallenge', quotesChallengeSchema);
