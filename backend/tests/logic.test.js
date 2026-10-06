import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/unused';
process.env.GEMINI_API_KEY = 'fake';
const { __setFetchForTests, parseJsonLoose } = await import('../src/services/gemini.js');
const ai = await import('../src/services/ai.js');
const { fallbackEvaluation, staticHint } = await import('../src/services/fallbacks.js');
const sc = await import('../src/services/scoring.js');
const { looksLikeGibberish, sanitizeUserText } = await import('../src/utils/text.js');

const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const book = { title: 'Livro', author: 'Autor', literaryMovement: 'Realismo', publicationYear: 1900, keyThemes: ['ironia'] };

test('texto real em português passa; teclado, repetição e lixo não', () => {
  assert.equal(looksLikeGibberish('Não é possível afirmar a traição de Capitu porque o livro é narrado exclusivamente por Bentinho, um narrador ciumento e não confiável que constrói a narrativa para justificar seus próprios erros.'), false);
  assert.equal(looksLikeGibberish('O olhar no velório é filtrado novamente pelo olhar de Bentinho! O ciúme altera a percepção do narrador, interpretando a dor da perda de uma amiga da família como prova de adultério.'), false);
  for (const bad of ['abjavadaskb '.repeat(10), 'a'.repeat(120), 'teste teste teste teste teste teste teste teste teste teste', 'qwrtpsdfghjklzxcvbnm '.repeat(6), 'x'.repeat(40) + ' y z']) {
    assert.equal(looksLikeGibberish(bad), true, bad);
  }
});

test('sanitizeUserText remove controle e normaliza espaços', () => {
  assert.equal(sanitizeUserText('  oi\u0000\u202E   mundo \n\n\n\n fim '), 'oi mundo \n\n fim');
});

test('pontuação soma 1000 no máximo e as notas seguem a rubrica', () => {
  assert.equal(sc.phase1Score({ correct: 3, total: 3 }), 300);
  assert.equal(sc.phase1Score({ correct: 2, total: 3, hintsUsed: 1 }), 180);
  assert.equal(sc.phase1Score({ correct: 0, total: 3, hintsUsed: 5 }), 0);
  assert.equal(sc.hotspotPoints(7), 43);
  assert.equal(sc.finalScore({ phase1: 300, phase2: 300, phase3Score10: 10 }), 1000);
  assert.equal(sc.finalScore({ phase1: 300, phase2: 301, phase3Score10: 10 }), 1000);
  const rubric = { coherenceWeight: 0.3, literaryDomainWeight: 0.4, argumentationWeight: 0.3 };
  assert.equal(sc.weightedRubricScore({ coherence: 10, bookKnowledge: 5, argumentation: 0 }, rubric), 5);
  assert.equal(sc.weightedRubricScore({ coherence: 99, bookKnowledge: -3, argumentation: 'x' }, rubric), 3); // clamp
  assert.deepEqual(['A+', 'A', 'B', 'C', 'D'], [950, 850, 750, 650, 100].map(sc.gradeFor));
});

test('parseJsonLoose aceita cerca de markdown e rejeita lixo', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonLoose('não é json'), { code: 'AI_BAD_JSON' });
});

test('dica que vaza a resposta correta é rejeitada', async () => {
  const quote = {
    quote: 'q', context: 'c', narrativeVoice: 'v', associationQuestion: 'p?', correctOptionId: 'o2',
    options: [{ optionId: 'o1', text: 'Alternativa errada qualquer' }, { optionId: 'o2', text: 'O pessimismo radical do narrador-defunto' }],
  };
  __setFetchForTests(reply('A resposta é o pessimismo radical do narrador-defunto, claro.'));
  await assert.rejects(ai.generateHint({ book, quote }), { code: 'AI_BAD_OUTPUT' });
  __setFetchForTests(reply('Quem conta a história já morreu: o que isso muda no tom?'));
  assert.match(await ai.generateHint({ book, quote }), /já morreu/);
});

test('questão gerada por IA: letras são reatribuídas e saídas ruins são rejeitadas', async () => {
  const good = {
    questionText: 'Enunciado?', correctLetter: 'b', explanation: 'porque sim',
    options: ['um', 'dois', 'três', 'quatro', 'cinco'].map((text) => ({ letter: 'Z', text })),
  };
  __setFetchForTests(reply(JSON.stringify(good)));
  const q = await ai.generateHotspotQuestion({ book, hotspot: { name: 'x', elementType: 'objeto' } });
  assert.deepEqual(q.options.map((o) => o.letter), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(q.correctOption, 'B');

  for (const broken of [{ ...good, options: good.options.slice(0, 4) }, { ...good, correctLetter: 'F' }, { ...good, options: Array(5).fill({ letter: 'A', text: 'igual' }) }]) {
    __setFetchForTests(reply(JSON.stringify(broken)));
    await assert.rejects(ai.generateHotspotQuestion({ book, hotspot: { name: 'x', elementType: 'objeto' } }), { code: 'AI_BAD_OUTPUT' });
  }
});

test('avaliação da IA com nota fora de 0-10 é rejeitada; falha de rede vira AI_UNAVAILABLE', async () => {
  const base = { criticResponse: 'ok', feedbackText: 'ok', coherence: 8, bookKnowledge: 8, argumentation: 8 };
  const args = { book, trial: { rubric: { systemPromptContext: 's' }, thesisQuestion: 't' }, messages: [], argument: 'x' };
  __setFetchForTests(reply(JSON.stringify({ ...base, coherence: 11 })));
  await assert.rejects(ai.criticTurn2(args), { code: 'AI_BAD_OUTPUT' });
  __setFetchForTests(async () => { throw new Error('rede'); });
  await assert.rejects(ai.criticTurn2(args), { code: 'AI_UNAVAILABLE' });
});

test('fallback de avaliação nunca passa de 7,0 e a dica estática não é vazia', () => {
  const trial = { thesisQuestion: 't', centralNodeContext: 'ironia narrador', rubric: { coherenceWeight: 0.3, literaryDomainWeight: 0.4, argumentationWeight: 0.3 } };
  const long = ('ironia narrador porque contudo portanto embora logo pois assim '.repeat(20));
  const out = fallbackEvaluation({ book, trial, userTexts: [long, long] });
  assert.ok(out.score <= 7);
  assert.ok(staticHint({ context: 'ctx', narrativeVoice: 'v' }).length > 20);
});
