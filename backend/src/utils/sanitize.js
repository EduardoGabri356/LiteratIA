// Funções puras que montam o que vai ao cliente SEM gabarito, dica ou explicação.
// Os controllers devem usar sempre estas funções, nunca devolver o documento cru.

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function publicBookCard(book) {
  return {
    bookId: String(book._id),
    slug: book.slug,
    title: book.title,
    author: book.author,
    coverImage: book.coverImageUrl,
    totalPhases: book.totalPhases,
  };
}

export function publicQuotesChallenge(challenge, { rng } = {}) {
  return {
    challengeId: String(challenge._id),
    quotes: challenge.quotes.map((q) => ({
      quoteId: q.quoteId,
      quote: q.quote,
      context: q.context,
      narrativeVoice: q.narrativeVoice,
      associationQuestion: q.associationQuestion,
      options: shuffle(
        q.options.map(({ optionId, text }) => ({ optionId, text })),
        rng,
      ),
    })),
  };
}

export function publicScene(scene) {
  return {
    sceneId: scene.sceneId,
    backgroundImage: scene.backgroundImage,
    styleTheme: scene.styleTheme,
    hotspots: scene.hotspots.map((h) => ({
      id: h.elementId,
      label: h.name,
      elementType: h.elementType,
      coords: { x: h.coords.x, y: h.coords.y, width: h.coords.width, height: h.coords.height },
    })),
  };
}

export function publicQuestion(hotspot) {
  const q = hotspot.question;
  return {
    hotspotId: hotspot.elementId,
    question: {
      questionId: q.questionId,
      statement: q.statement,
      sourceExam: q.sourceExam,
      examYear: q.examYear,
      options: q.options.map(({ letter, text }) => ({ letter, text })),
    },
  };
}

export function publicTrial(trial) {
  return {
    thesisId: trial.thesisId,
    title: trial.title,
    criticName: trial.criticName,
    avatarUrl: trial.avatarUrl,
    premiseText: trial.thesisQuestion,
  };
}
