import mongoose from 'mongoose';
const { Schema } = mongoose;

const rubricSchema = new Schema(
  {
    coherenceWeight: { type: Number, required: true },
    literaryDomainWeight: { type: Number, required: true },
    argumentationWeight: { type: Number, required: true },
    systemPromptContext: { type: String, required: true }, // persona do crítico (system prompt)
    minimumPassScore: { type: Number, default: 6 },
  },
  { _id: false },
);

const trialSchema = new Schema(
  {
    bookSlug: { type: String, required: true, unique: true },
    thesisId: { type: String, required: true },
    title: String,
    criticName: String,
    avatarUrl: String,
    thesisQuestion: { type: String, required: true }, // vira premiseText no cliente
    centralNodeContext: String, // SOMENTE servidor: alimenta o prompt da IA
    rubric: { type: rubricSchema, required: true },
  },
  { timestamps: true, collection: 'trials' },
);

export const Trial = mongoose.models.Trial || mongoose.model('Trial', trialSchema);
