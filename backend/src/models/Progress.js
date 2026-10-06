import mongoose from 'mongoose';
const { Schema } = mongoose;

const phase1 = new Schema(
  {
    completed: { type: Boolean, default: false },
    // A 1ª resposta de cada citação vale (certa ou errada); a fase fecha quando todas foram respondidas.
    answers: {
      type: [new Schema({ quoteId: String, optionId: String, correct: Boolean, at: { type: Date, default: Date.now } }, { _id: false })],
      default: [],
    },
    hintedQuotes: { type: [String], default: [] }, // a dica só pesa uma vez por citação
    errorCount: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    lastAttemptAt: Date,
    completedAt: Date,
  },
  { _id: false },
);

const phase2 = new Schema(
  {
    completed: { type: Boolean, default: false },
    resolvedHotspots: { type: [String], default: [] }, // hotspots já respondidos (certo ou errado): a 1ª resposta vale
    // Questões geradas por IA aguardando resposta (gabarito fica só aqui, no servidor).
    pending: { type: Schema.Types.Mixed, default: {} },
    history: {
      type: [
        new Schema(
          {
            hotspotId: String,
            selected: String,
            correct: Boolean,
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    score: { type: Number, default: 0 },
    completedAt: Date,
  },
  { _id: false },
);

const phase3 = new Schema(
  {
    messages: {
      type: [
        new Schema(
          {
            turn: Number,
            role: { type: String, enum: ['user', 'critic'] },
            text: String,
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    approved: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    rubricBreakdown: new Schema(
      { coherence: Number, bookKnowledge: Number, argumentation: Number },
      { _id: false },
    ),
    feedbackText: String,
    evaluatedBy: { type: String, enum: ['ai', 'fallback'] },
    evaluatedAt: Date,
  },
  { _id: false },
);

const progressSchema = new Schema(
  {
    sessionUuid: { type: String, required: true },
    bookSlug: { type: String, required: true },
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    currentPhase: { type: Number, min: 1, max: 3, default: 1 },
    phase1: { type: phase1, default: () => ({}) },
    phase2: { type: phase2, default: () => ({}) },
    phase3: { type: phase3, default: () => ({}) },
    finalScore: { type: Number, default: 0 },
    grade: String,
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    totalTimeSeconds: Number,
  },
  { timestamps: true, collection: 'progress' },
);

// Uma linha de progresso por jogador+livro; também serve de lookup para todas as rotas.
progressSchema.index({ sessionUuid: 1, bookSlug: 1 }, { unique: true });

export const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);
