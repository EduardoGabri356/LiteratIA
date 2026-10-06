import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformBook, validateBook } from '../scripts/lib/transform.js';
import {
  publicQuestion, publicQuotesChallenge, publicScene, publicTrial, shuffle,
} from '../src/utils/sanitize.js';

// Livro sintético com a mesma forma do JSON do Gemini.
function makeBook(overrides = {}) {
  const hotspot = (i) => ({
    elementId: `elem_${i}`,
    name: `Elemento ${i}`,
    elementType: ['personagem', 'objeto', 'cena'][i % 3],
    coords: { x: (i * 13) % 80, y: i % 2 === 0 ? 5 : 55, width: 10, height: 20 },
    narrativeFunction: 'função secreta',
    question: {
      questionId: `q_${i}`,
      statement: `Enunciado ${i}`,
      sourceExam: 'FUVEST',
      examYear: 2021,
      options: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, text: `Alt ${letter} ${i}` })),
      correctOption: 'C',
      explanation: 'explicação secreta',
    },
  });
  return {
    slug: 'livro-teste', title: 'Livro Teste', author: 'Autor', publicationYear: 1900,
    literaryMovement: 'Realismo', coverImageUrl: '/c.webp', generalSummary: 'Resumo', keyThemes: ['a'],
    quotesPhase: [1, 2, 3].map((n) => ({
      quoteId: `q${n}`, quote: `Citação ${n}`, context: 'ctx', narrativeVoice: '1ª pessoa',
      associationQuestion: `Pergunta ${n}?`,
      options: ['um', 'dois', 'três', 'quatro', 'cinco'].map((t) => `${t} (${n})`),
      correctAnswer: `três (${n})`,
    })),
    pointAndClickPhase: [0, 1, 2, 3, 4, 5, 6].map(hotspot),
    trialPhase: {
      thesisQuestion: 'Tese?', centralNodeContext: 'contexto secreto',
      aiEvaluationRubrics: {
        coherenceWeight: 0.3, literaryDomainWeight: 0.4, argumentationWeight: 0.3,
        systemPromptContext: 'Você é o autor.', minimumPassScore: 6,
      },
    },
    actionFigureReward: { figureId: 'fig_1', name: 'Figure', assetUrl: '/a.glb', thumbnailUrl: '/t.webp' },
    ...overrides,
  };
}

test('livro válido passa sem erros', () => {
  const { errors } = validateBook(makeBook());
  assert.deepEqual(errors, []);
});

test('correctAnswer que não bate com nenhuma option é erro', () => {
  const b = makeBook();
  b.quotesPhase[0].correctAnswer = 'texto que não existe';
  assert.ok(validateBook(b).errors.some((e) => e.includes('correctAnswer')));
});

test('caracteres cirílicos (como no keyThemes do Gemini) são erro', () => {
  const b = makeBook({ keyThemes: ['Pessimismo', ' паразиismo social'] });
  const { errors } = validateBook(b);
  assert.ok(errors.some((e) => e.includes('outro alfabeto') && e.includes('keyThemes[1]')));
});

test('menos de 6 hotspots é erro', () => {
  const b = makeBook();
  b.pointAndClickPhase = b.pointAndClickPhase.slice(0, 5);
  assert.ok(validateBook(b).errors.some((e) => e.includes('6 a 10')));
});

test('pesos da rubrica que não somam 1 são erro', () => {
  const b = makeBook();
  b.trialPhase.aiEvaluationRubrics.coherenceWeight = 0.5;
  assert.ok(validateBook(b).errors.some((e) => e.includes('rubrica')));
});

test('coords fora da imagem são erro; hotspots sobrepostos são aviso', () => {
  const b = makeBook();
  b.pointAndClickPhase[0].coords = { x: 95, y: 5, width: 10, height: 20 };
  assert.ok(validateBook(b).errors.some((e) => e.includes('100%')));

  const c = makeBook();
  c.pointAndClickPhase[1].coords = { ...c.pointAndClickPhase[0].coords };
  const r = validateBook(c);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('se sobrepõem')));
});

test('transformBook mapeia a resposta correta para um optionId estável', () => {
  const raw = makeBook();
  const { quotes, scene, trial, book } = transformBook(raw, 2);
  for (const [i, q] of quotes.quotes.entries()) {
    const correct = q.options.find((o) => o.optionId === q.correctOptionId);
    assert.equal(correct.text, raw.quotesPhase[i].correctAnswer);
  }
  assert.equal(book.order, 2);
  assert.equal(book.totalHotspots, 7);
  assert.equal(scene.hotspots.length, 7);
  assert.equal(trial.criticName, 'Autor');
  assert.equal(trial.rubric.minimumPassScore, 6);
});

test('o que vai ao cliente nunca contém gabarito, explicação ou contexto secreto', () => {
  const { quotes, scene, trial } = transformBook(makeBook());
  const payload = JSON.stringify([
    publicQuotesChallenge({ _id: 'c1', ...quotes }),
    publicScene(scene),
    publicQuestion(scene.hotspots[0]),
    publicTrial(trial),
  ]);
  for (const forbidden of [
    'correctOptionId', 'correctOption', 'explanation', 'narrativeFunction',
    'explicação secreta', 'função secreta', 'contexto secreto', 'centralNodeContext', 'systemPromptContext',
  ]) {
    assert.ok(!payload.includes(forbidden), `vazou: ${forbidden}`);
  }
});

test('shuffle preserva os elementos e não altera o array original', () => {
  const original = [1, 2, 3, 4, 5];
  const out = shuffle(original, () => 0.1);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
});
