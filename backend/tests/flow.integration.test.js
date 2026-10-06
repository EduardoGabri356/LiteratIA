// Fluxo completo contra um MongoDB real, com o Gemini simulado.
//   INTEGRATION_MONGODB_URI=mongodb://127.0.0.1:27017/literatia_test npm run seed (com MONGODB_URI igual) && npm test
// Sem a variável, o teste é ignorado. Pré-requisito: `npm run seed` no mesmo banco com o livro "livro-teste".
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

const URI = process.env.INTEGRATION_MONGODB_URI;
const opts = { skip: !URI && 'defina INTEGRATION_MONGODB_URI para rodar' };

let base, server, uuid, mongoose, models, gemini;
const SLUG = 'livro-teste';
const TEXT1 =
  'Não é possível afirmar a traição porque o livro é narrado exclusivamente por um narrador ciumento e não confiável, que constrói a narrativa para justificar seus próprios erros.';
const TEXT2 =
  'O olhar descrito é filtrado novamente pelo próprio narrador, e o ciúme altera a percepção dele, interpretando a dor da perda como se fosse prova de adultério e culpa.';

async function api(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'X-Session-UUID': uuid, ...(body && { 'Content-Type': 'application/json' }), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (!URI) return;
  process.env.MONGODB_URI = URI;
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'fake-key';
  gemini = await import('../src/services/gemini.js');
  const { connectDb } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  mongoose = (await import('mongoose')).default;
  models = await import('../src/models/index.js');
  await connectDb();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  uuid = randomUUID();
  // dicas geradas ficam em cache no banco: limpa para o teste exercitar a IA de novo
  await models.QuotesChallenge.updateMany({ bookSlug: SLUG }, { $set: { 'quotes.0.hint': null, 'quotes.1.hint': null, 'quotes.2.hint': null } });

  // Gemini simulado: decide a resposta pelo schema pedido.
  gemini.__setFetchForTests(async (_url, init) => {
    const req = JSON.parse(init.body);
    const props = req.generationConfig.responseSchema?.properties ?? {};
    let text;
    if (props.isValidArgument) text = JSON.stringify({ isValidArgument: true, criticResponse: 'Boa defesa! Mas e o velório?' });
    else if (props.coherence) text = JSON.stringify({ criticResponse: 'Brilhante tréplica.', feedbackText: 'Ótimo.', coherence: 9, bookKnowledge: 8, argumentation: 8 });
    else text = 'Pense em quem conta a história e no que ele quer provar. O que isso diz sobre a confiança no relato?';
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  });
});

after(async () => {
  if (!URI) return;
  await models.Progress.deleteMany({ sessionUuid: uuid });
  await models.Session.deleteMany({ sessionUuid: uuid });
  await models.UserReward.deleteMany({ sessionUuid: uuid });
  server.close();
  await mongoose.disconnect();
});

test('jogo completo de um livro, fase a fase', opts, async () => {
  // Hub
  let r = await api('GET', '/user/session');
  assert.equal(r.status, 200);
  const card = r.body.books.find((b) => b.slug === SLUG);
  assert.equal(card.status, 'NOT_STARTED');
  assert.equal(card.badgeUnlocked, false);

  // Sem /load não joga; sem concluir a fase anterior não avança
  r = await api('GET', `/books/${SLUG}/phase-1`);
  assert.equal(r.body.error.code, 'BOOK_NOT_STARTED');
  r = await api('POST', `/books/${SLUG}/load`, { forceReset: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.currentPhase, 1);
  r = await api('GET', `/books/${SLUG}/phase-2`);
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'PHASE_LOCKED');
  r = await api('GET', '/books/nao-existe/phase-1');
  assert.equal(r.status, 404);

  // Fase 1: a primeira resposta de cada citação é definitiva
  r = await api('GET', `/books/${SLUG}/phase-1`);
  assert.equal(r.status, 200);
  assert.ok(!/correct/i.test(JSON.stringify(r.body)), 'fase 1 vazou gabarito');
  const { challengeId, quotes } = r.body;
  const pick = (q, wanted) => q.options.find((o) => o.text.startsWith(wanted)).optionId;
  const q1 = quotes.find((q) => q.quoteId === 'q1');

  r = await api('POST', `/books/${SLUG}/phase-1/hint`, { quoteId: 'q1' });
  assert.equal(r.body.source, 'ai');
  assert.equal(r.body.hintsUsed, 1);
  r = await api('POST', `/books/${SLUG}/phase-1/hint`, { quoteId: 'q1' });
  assert.equal(r.body.hintsUsed, 1, 'a mesma citação não cobra duas vezes');
  r = await api('POST', `/books/${SLUG}/phase-1/validate`, { challengeId: 'x', associations: [{ quoteId: 'q1', optionId: 'y' }] });
  assert.equal(r.body.error.code, 'CHALLENGE_MISMATCH');

  r = await api('POST', `/books/${SLUG}/phase-1/validate`, { challengeId, associations: [{ quoteId: 'q1', optionId: pick(q1, 'um') }] });
  assert.equal(r.body.isCorrect, false);
  assert.equal(r.body.evaluatedResults[0].correctOptionId, pick(q1, 'três'), 'errou: o gabarito é revelado');
  assert.equal(r.body.allCompleted, false);

  r = await api('POST', `/books/${SLUG}/phase-1/validate`, { challengeId, associations: [{ quoteId: 'q1', optionId: pick(q1, 'três') }] });
  assert.equal(r.body.evaluatedResults[0].correct, false, 'não dá para trocar uma resposta já dada');
  assert.equal(r.body.evaluatedResults[0].alreadyAnswered, true);

  r = await api('GET', `/books/${SLUG}/phase-2`);
  assert.equal(r.status, 403, 'fase 2 só abre depois de responder todas as citações');

  r = await api('POST', `/books/${SLUG}/phase-1/validate`, {
    challengeId,
    associations: quotes.filter((q) => q.quoteId !== 'q1').map((q) => ({ quoteId: q.quoteId, optionId: pick(q, 'três') })),
  });
  assert.equal(r.body.allCompleted, true);
  assert.equal(r.body.nextPhaseUnlocked, 2);
  assert.equal(r.body.phase1Score, 200 - 20); // 2 de 3 certas, 1 dica

  r = await api('GET', `/books/${SLUG}/phase-1`); // o progresso volta ao reabrir
  assert.equal(r.body.progress.answers.length, 3);
  assert.equal(r.body.progress.completed, true);

  // Fase 2: a primeira resposta vale, certa ou errada
  r = await api('GET', `/books/${SLUG}/phase-2`);
  assert.equal(r.status, 200);
  assert.ok(!/correct\b|explanation|narrativeFunction/i.test(JSON.stringify(r.body.hotspots)), 'fase 2 vazou gabarito');
  const hotspots = r.body.hotspots;
  assert.equal(hotspots.length, 7);

  r = await api('GET', `/books/${SLUG}/phase-2/hotspot/${hotspots[0].id}`);
  assert.ok(!/correct|explanation/i.test(JSON.stringify(r.body)));
  const qid = r.body.question.questionId;
  r = await api('POST', `/books/${SLUG}/phase-2/submit`, { hotspotId: hotspots[0].id, questionId: qid, selectedOption: 'A' });
  assert.equal(r.body.isCorrect, false);
  assert.equal(r.body.correctOption, 'C', 'errou: o gabarito é revelado');
  assert.ok(r.body.pedagogicalExplanation);
  r = await api('POST', `/books/${SLUG}/phase-2/submit`, { hotspotId: hotspots[0].id, questionId: qid, selectedOption: 'C' });
  assert.equal(r.body.isCorrect, false, 'não dá para refazer');
  assert.equal(r.body.alreadyAnswered, true);
  r = await api('GET', `/books/${SLUG}/phase-2/hotspot/${hotspots[0].id}`);
  assert.equal(r.body.result.selectedOption, 'A');
  r = await api('GET', `/books/${SLUG}/phase-2`);
  assert.equal(r.body.hotspots[0].status, 'wrong');

  for (const [i, h] of hotspots.slice(1).entries()) {
    const q = (await api('GET', `/books/${SLUG}/phase-2/hotspot/${h.id}`)).body.question.questionId;
    r = await api('POST', `/books/${SLUG}/phase-2/submit`, { hotspotId: h.id, questionId: q, selectedOption: 'C' });
    assert.equal(r.body.isCorrect, true);
    assert.equal(r.body.phase2Progress.answeredCount, i + 2);
  }
  assert.equal(r.body.phase2Progress.canTransitionToPhase3, true);
  assert.equal(r.body.phase2Progress.correctCount, 6);

  // Fase 3
  r = await api('GET', `/books/${SLUG}/phase-3`);
  assert.equal(r.status, 200);
  assert.ok(!/centralNodeContext|systemPromptContext|contexto secreto/.test(JSON.stringify(r.body)));

  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 2, userArgument: TEXT2 });
  assert.equal(r.body.error.code, 'WRONG_TURN');
  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 1, userArgument: 'abjavadaskb '.repeat(12) });
  assert.equal(r.body.isValidArgument, false); // texto sem sentido não consome o turno
  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 1, userArgument: 'curto demais' });
  assert.equal(r.body.error.code, 'ARGUMENT_TOO_SHORT');

  r = await api('POST', `/books/${SLUG}/complete`);
  assert.equal(r.body.error.code, 'NOT_APPROVED');

  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 1, userArgument: TEXT1 });
  assert.equal(r.body.isValidArgument, true);
  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 1, userArgument: TEXT1 });
  assert.equal(r.body.error.code, 'WRONG_TURN');
  r = await api('POST', `/books/${SLUG}/phase-3/debate`, { turn: 2, userArgument: TEXT2 });
  assert.equal(r.body.isFinalEvaluation, true);
  assert.equal(r.body.evaluation.approved, true);
  assert.equal(r.body.evaluation.score, 8.3); // 9*0.3 + 8*0.4 + 8*0.3, calculado no servidor

  // Fase 4
  r = await api('POST', `/books/${SLUG}/complete`);
  assert.equal(r.body.status, 'SUCCESS');
  const first = r.body.summary;
  assert.equal(first.grade, 'B'); // 770
  // fase 1: 2/3 de 300 - 20 (dica) = 180 | fase 2: 6 acertos x 43 = 258 | fase 3: 8,3 -> 332
  assert.equal(first.finalScore, 180 + 258 + 332);
  assert.equal(r.body.rewards.actionFigure.id, 'fig_1');
  r = await api('POST', `/books/${SLUG}/complete`);
  assert.deepEqual(r.body.summary, first, 'complete é idempotente');
  assert.equal((await models.UserReward.findOne({ sessionUuid: uuid }).lean()).unlockedItems.length, 1);

  r = await api('GET', '/user/session');
  const done = r.body.books.find((b) => b.slug === SLUG);
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.badgeUnlocked, true);
  assert.equal(done.actionFigure.id, 'fig_1');
});

test('Gemini fora do ar: dica e avaliação caem no fallback', opts, async () => {
  gemini.__setFetchForTests(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  let r = await api("POST", `/books/${SLUG}/load`, { forceReset: true });
  assert.equal(r.body.phase1Data.completed, false);
  let r2 = await api('GET', `/books/${SLUG}/phase-1`);
  r2 = await api('POST', `/books/${SLUG}/phase-1/hint`, { quoteId: 'q2' });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.source, 'fallback');
  assert.ok(r2.body.hintText.length > 10);
});
