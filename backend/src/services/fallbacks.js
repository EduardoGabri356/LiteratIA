// Respostas estáticas para quando o Gemini estiver fora do ar ou devolver lixo.
import { weightedRubricScore } from './scoring.js';

export function staticHint(quote) {
  const ctx = quote.context ? `Releia o contexto: ${quote.context}` : 'Releia o trecho com calma.';
  const voice = quote.narrativeVoice ? ` Quem fala aqui? (${quote.narrativeVoice}).` : '';
  return `${ctx}${voice} Que recurso do estilo da obra esse trecho ilustra?`;
}

export const GIBBERISH_REPLY =
  'Isso não é um argumento, meu jovem; é um acidente de teclado. Volte com um raciocínio sério, apoiado na obra.';

export function fallbackTurn1(trial) {
  return {
    isValidArgument: true,
    criticResponse:
      `Interessante, mas ainda não me convenceu. Reflita: "${trial.thesisQuestion}" ` +
      'Que passagem concreta do livro sustenta a sua leitura, e como você responde a quem a lê de outro modo?',
  };
}

// Heurística transparente: usada só quando a IA falha no turno final. Nota máxima 7,0 e marcada como 'fallback'.
export function fallbackEvaluation({ book, trial, userTexts }) {
  const all = userTexts.join(' ').toLowerCase();
  const words = all.match(/\p{L}+/gu) ?? [];
  const bag = [book.title, book.author, ...(book.keyThemes ?? []), trial.centralNodeContext ?? '']
    .join(' ')
    .toLowerCase()
    .match(/\p{L}{5,}/gu) ?? [];
  const vocab = new Set(bag);
  const hits = new Set(words.filter((w) => w.length >= 5 && vocab.has(w))).size;
  const connectives = ['porque', 'portanto', 'contudo', 'embora', 'logo', 'pois', 'assim', 'entretanto', 'todavia', 'enquanto'];
  const conn = connectives.filter((c) => all.includes(c)).length;

  const clamp = (n) => Math.max(0, Math.min(7, Math.round(n * 10) / 10));
  const rubric = {
    coherence: clamp(3 + Math.min(words.length, 200) / 50),
    bookKnowledge: clamp(2 + hits * 0.8),
    argumentation: clamp(2.5 + conn * 1.2),
  };
  return {
    criticResponse:
      'Encerro o debate aqui. Seus argumentos foram devidamente registrados, e a avaliação segue abaixo.',
    feedbackText:
      'O avaliador de IA estava indisponível, então esta nota veio de uma checagem automática simples (tamanho do texto, ' +
      'vocabulário da obra e conectivos). Tente de novo mais tarde para uma avaliação completa.',
    rubric,
    score: weightedRubricScore(rubric, trial.rubric),
  };
}
