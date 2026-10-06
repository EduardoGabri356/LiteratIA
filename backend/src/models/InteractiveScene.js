import mongoose from 'mongoose';
const { Schema } = mongoose;

const pct = { type: Number, required: true, min: 0, max: 100 };

const hotspotSchema = new Schema(
  {
    elementId: { type: String, required: true },
    name: { type: String, required: true },
    elementType: { type: String, enum: ['personagem', 'objeto', 'cena'], required: true },
    // Percentuais (0-100) relativos à imagem: o mapa fica responsivo.
    coords: new Schema({ x: pct, y: pct, width: pct, height: pct }, { _id: false }),
    narrativeFunction: String, // SOMENTE servidor até o aluno responder
    question: new Schema(
      {
        questionId: { type: String, required: true },
        statement: { type: String, required: true },
        sourceExam: String,
        examYear: Number,
        options: [
          new Schema(
            { letter: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true }, text: { type: String, required: true } },
            { _id: false },
          ),
        ],
        correctOption: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true }, // SOMENTE servidor
        explanation: { type: String, required: true }, // SOMENTE servidor até a resposta
      },
      { _id: false },
    ),
  },
  { _id: false },
);

const sceneSchema = new Schema(
  {
    bookSlug: { type: String, required: true, unique: true },
    sceneId: { type: String, required: true },
    backgroundImage: String,
    styleTheme: { type: String, default: 'rusty-lake' },
    hotspots: { type: [hotspotSchema], validate: (v) => v.length >= 1 },
  },
  { timestamps: true, collection: 'interactive_scenes' },
);

export const InteractiveScene =
  mongoose.models.InteractiveScene || mongoose.model('InteractiveScene', sceneSchema);
