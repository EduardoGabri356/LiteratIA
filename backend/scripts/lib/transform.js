// Validação + transformação do JSON de conteúdo (formato Gemini) para as coleções do Mongo.
// Sem dependências: roda com `npm run check:data` mesmo sem banco.

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
// Cirílico, grego, árabe, hebraico, indico, CJK etc. Texto em PT-BR não deve ter nada disso.
const NON_LATIN = /[\u0370-\u052F\u0590-\u06FF\u0900-\u0DFF\u3040-\u30FF\u4E00-\u9FFF]/;

function* walkStrings(value, path = '') {
  if (typeof value === 'string') yield { path, value };
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* walkStrings(v, `${path}[${i}]`);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* walkStrings(v, path ? `${path}.${k}` : k);
  }
}

function overlapRatio(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

const blank = (v) => typeof v !== 'string' || v.trim() === '';

export function validateBook(raw, label = raw?.slug ?? '?') {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`[${label}] ${m}`);
  const warn = (m) => warnings.push(`[${label}] ${m}`);

  if (!raw || typeof raw !== 'object') return { errors: [`[${label}] entrada não é um objeto`], warnings };

  for (const f of ['slug', 'title', 'author', 'literaryMovement', 'coverImageUrl', 'generalSummary']) {
    if (blank(raw[f])) err(`campo obrigatório ausente: ${f}`);
  }
  if (!Number.isInteger(raw.publicationYear)) err('publicationYear deve ser inteiro');
  if (raw.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw.slug)) err(`slug inválido: "${raw.slug}"`);

  for (const { path, value } of walkStrings(raw)) {
    if (NON_LATIN.test(value)) err(`caracteres de outro alfabeto em ${path}: "${value}"`);
  }

  // ---- Fase 1 ----
  const quotes = raw.quotesPhase;
  if (!Array.isArray(quotes) || quotes.length === 0) err('quotesPhase vazio ou ausente');
  else {
    if (quotes.length < 2 || quotes.length > 3) warn(`quotesPhase tem ${quotes.length} itens (o GDD prevê 2 a 3)`);
    const seen = new Set();
    for (const q of quotes) {
      const id = q.quoteId ?? '(sem quoteId)';
      if (!q.quoteId || seen.has(q.quoteId)) err(`quoteId ausente ou duplicado: ${id}`);
      seen.add(q.quoteId);
      if (blank(q.quote)) err(`${id}: quote vazia`);
      if (blank(q.associationQuestion)) err(`${id}: associationQuestion vazia`);
      if (!Array.isArray(q.options) || q.options.length < 2) {
        err(`${id}: options precisa de pelo menos 2 itens`);
        continue;
      }
      if (new Set(q.options).size !== q.options.length) err(`${id}: options com textos repetidos`);
      const hits = q.options.filter((o) => o === q.correctAnswer).length;
      if (hits !== 1) err(`${id}: correctAnswer deve coincidir EXATAMENTE com uma option (coincide com ${hits})`);
    }
  }

  // ---- Fase 2 ----
  const hs = raw.pointAndClickPhase;
  if (!Array.isArray(hs) || hs.length < 6 || hs.length > 10) {
    err(`pointAndClickPhase deve ter de 6 a 10 elementos (tem ${Array.isArray(hs) ? hs.length : 0})`);
  }
  if (Array.isArray(hs)) {
    const ids = new Set();
    const qids = new Set();
    for (const h of hs) {
      const id = h.elementId ?? '(sem elementId)';
      if (!h.elementId || ids.has(h.elementId)) err(`elementId ausente ou duplicado: ${id}`);
      ids.add(h.elementId);
      if (blank(h.name)) err(`${id}: name vazio`);
      if (!['personagem', 'objeto', 'cena'].includes(h.elementType)) err(`${id}: elementType inválido ("${h.elementType}")`);

      const c = h.coords;
      if (!c || ['x', 'y', 'width', 'height'].some((k) => typeof c[k] !== 'number')) err(`${id}: coords incompleto`);
      else {
        if (c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0) err(`${id}: coords com valores não positivos`);
        if (c.x + c.width > 100 || c.y + c.height > 100) err(`${id}: coords ultrapassa 100% da imagem`);
      }

      const q = h.question;
      if (!q) { err(`${id}: question ausente`); continue; }
      if (!q.questionId || qids.has(q.questionId)) err(`${id}: questionId ausente ou duplicado`);
      qids.add(q.questionId);
      if (blank(q.statement)) err(`${id}: statement vazio`);
      if (blank(q.explanation)) err(`${id}: explanation vazia`);
      const letters = Array.isArray(q.options) ? q.options.map((o) => o.letter) : [];
      if (letters.join('') !== LETTERS.join('')) err(`${id}: options devem ser exatamente A-E em ordem (veio: ${letters.join(',') || 'nada'})`);
      if (!LETTERS.includes(q.correctOption)) err(`${id}: correctOption inválida ("${q.correctOption}")`);
      if (Array.isArray(q.options) && q.options.some((o) => blank(o.text))) err(`${id}: alternativa com texto vazio`);
    }
    // Hotspots sobrepostos viram cliques ambíguos. Aviso, pois as coords serão reajustadas com as imagens finais.
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        if (!hs[i].coords || !hs[j].coords) continue;
        const r = overlapRatio(hs[i].coords, hs[j].coords);
        if (r > 0.25) warn(`hotspots "${hs[i].elementId}" e "${hs[j].elementId}" se sobrepõem (${Math.round(r * 100)}% do menor)`);
      }
    }
  }

  // ---- Fase 3 ----
  const t = raw.trialPhase;
  if (!t) err('trialPhase ausente');
  else {
    if (blank(t.thesisQuestion)) err('trialPhase.thesisQuestion vazia');
    if (blank(t.centralNodeContext)) err('trialPhase.centralNodeContext vazio');
    const r = t.aiEvaluationRubrics;
    if (!r) err('trialPhase.aiEvaluationRubrics ausente');
    else {
      const sum = (r.coherenceWeight ?? 0) + (r.literaryDomainWeight ?? 0) + (r.argumentationWeight ?? 0);
      if (Math.abs(sum - 1) > 0.001) err(`pesos da rubrica somam ${sum.toFixed(3)} (deveriam somar 1)`);
      if (blank(r.systemPromptContext)) err('rubrica sem systemPromptContext');
      if (typeof r.minimumPassScore !== 'number' || r.minimumPassScore < 0 || r.minimumPassScore > 10) err('minimumPassScore deve estar entre 0 e 10');
    }
  }

  // ---- Recompensa ----
  const f = raw.actionFigureReward;
  if (!f) err('actionFigureReward ausente');
  else for (const k of ['figureId', 'name']) if (blank(f[k])) err(`actionFigureReward.${k} ausente`);

  return { errors, warnings };
}

export function transformBook(raw, order = 0) {
  const slug = raw.slug;
  const snake = slug.replace(/-/g, '_');

  const book = {
    slug,
    title: raw.title,
    author: raw.author,
    authorShortBio: raw.authorShortBio,
    publicationYear: raw.publicationYear,
    literaryMovement: raw.literaryMovement,
    historicalContext: raw.historicalContext,
    generalSummary: raw.generalSummary,
    keyThemes: raw.keyThemes ?? [],
    coverImageUrl: raw.coverImageUrl,
    badgeUrl: `/assets/badges/gold-${slug}.svg`,
    totalPhases: 3,
    totalHotspots: raw.pointAndClickPhase.length,
    order,
    active: raw.active !== false,
    actionFigureReward: { ...raw.actionFigureReward },
  };

  const quotes = {
    bookSlug: slug,
    quotes: raw.quotesPhase.map((q) => {
      // Texto da resposta correta -> id estável. O cliente só vê ids; o servidor compara ids.
      const options = q.options.map((text, i) => ({ optionId: `${q.quoteId}_o${i + 1}`, text }));
      return {
        quoteId: q.quoteId,
        quote: q.quote,
        context: q.context,
        narrativeVoice: q.narrativeVoice,
        associationQuestion: q.associationQuestion,
        hint: q.hint ?? null,
        options,
        correctOptionId: options[q.options.indexOf(q.correctAnswer)].optionId,
      };
    }),
  };

  const scene = {
    bookSlug: slug,
    sceneId: `sc_${snake}_01`,
    backgroundImage: `/assets/scenes/${slug}.jpeg`,
    styleTheme: 'rusty-lake',
    hotspots: raw.pointAndClickPhase.map((h) => ({
      elementId: h.elementId,
      name: h.name,
      elementType: h.elementType,
      coords: { x: h.coords.x, y: h.coords.y, width: h.coords.width, height: h.coords.height },
      narrativeFunction: h.narrativeFunction,
      question: {
        questionId: h.question.questionId,
        statement: h.question.statement,
        sourceExam: h.question.sourceExam,
        examYear: h.question.examYear,
        options: h.question.options.map(({ letter, text }) => ({ letter, text })),
        correctOption: h.question.correctOption,
        explanation: h.question.explanation,
      },
    })),
  };

  const trial = {
    bookSlug: slug,
    thesisId: `th_${snake}`,
    title: `O Tribunal da Literatura: ${raw.title}`,
    criticName: raw.author, // o persona do prompt é o próprio autor
    avatarUrl: `/assets/critics/${slug}.webp`,
    thesisQuestion: raw.trialPhase.thesisQuestion,
    centralNodeContext: raw.trialPhase.centralNodeContext,
    rubric: { ...raw.trialPhase.aiEvaluationRubrics },
  };

  return { book, quotes, scene, trial };
}
