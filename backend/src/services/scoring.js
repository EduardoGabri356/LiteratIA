// Pontuação: Fase 1 (300) + Fase 2 (300) + Fase 3 (400) = 1000.
export const MAX = { phase1: 300, phase2: 300, phase3: 400 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

// Proporcional aos acertos, menos 20 por citação com dica (mínimo 0).
export function phase1Score({ correct = 0, total = 1, hintsUsed = 0 }) {
  return Math.max(0, Math.round((MAX.phase1 * correct) / total) - hintsUsed * 20);
}

// Cada hotspot vale 300/total; só pontua quem acerta (a primeira resposta é a que vale).
export function hotspotPoints(totalHotspots) {
  return Math.round(MAX.phase2 / totalHotspots);
}

export function phase3Points(score10) {
  return Math.round((clamp(score10, 0, 10) * MAX.phase3) / 10);
}

// Nota 0-10 do debate a partir dos pesos da rubrica do livro (o servidor calcula; a IA só dá as notas parciais).
export function weightedRubricScore({ coherence, bookKnowledge, argumentation }, rubric) {
  const c = clamp(Number(coherence) || 0, 0, 10);
  const b = clamp(Number(bookKnowledge) || 0, 0, 10);
  const a = clamp(Number(argumentation) || 0, 0, 10);
  return round1(c * rubric.coherenceWeight + b * rubric.literaryDomainWeight + a * rubric.argumentationWeight);
}

export function finalScore({ phase1 = 0, phase2 = 0, phase3Score10 = 0 }) {
  return Math.min(1000, Math.round(phase1) + Math.round(phase2) + phase3Points(phase3Score10));
}

export function gradeFor(score) {
  if (score >= 900) return 'A+';
  if (score >= 800) return 'A';
  if (score >= 700) return 'B';
  if (score >= 600) return 'C';
  return 'D';
}
