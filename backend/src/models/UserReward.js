import mongoose from 'mongoose';
const { Schema } = mongoose;

const unlockedItemSchema = new Schema(
  {
    bookSlug: { type: String, required: true },
    badge: String,
    actionFigure: new Schema(
      { figureId: String, name: String, assetUrl: String, thumbnailUrl: String },
      { _id: false },
    ),
    unlockedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userRewardSchema = new Schema(
  {
    sessionUuid: { type: String, required: true, unique: true },
    unlockedItems: { type: [unlockedItemSchema], default: [] },
  },
  { timestamps: true, collection: 'user_rewards' },
);

export const UserReward = mongoose.models.UserReward || mongoose.model('UserReward', userRewardSchema);
