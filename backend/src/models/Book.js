import mongoose from 'mongoose';
const { Schema } = mongoose;

const figureSchema = new Schema(
  {
    figureId: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    assetUrl: String,
    thumbnailUrl: String,
  },
  { _id: false },
);

const bookSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true },
    author: { type: String, required: true },
    authorShortBio: String,
    publicationYear: Number,
    literaryMovement: String,
    historicalContext: String,
    generalSummary: String,
    keyThemes: { type: [String], default: [] },
    coverImageUrl: String,
    badgeUrl: String,
    totalPhases: { type: Number, default: 3 },
    totalHotspots: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    actionFigureReward: { type: figureSchema, required: true },
  },
  { timestamps: true, collection: 'books' },
);

bookSchema.index({ active: 1, order: 1 });

export const Book = mongoose.models.Book || mongoose.model('Book', bookSchema);
