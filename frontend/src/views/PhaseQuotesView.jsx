import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { ArrowLeft, ArrowRight, Check, Lightbulb, X } from 'lucide-react';
import Header from '../components/Header';
import TornPaperQuote from '../components/TornPaperQuote';
import { get, openBook, post, routeForPhase } from '../services/api';

export default function PhaseQuotesView() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [bookTitle, setBookTitle] = useState('');
  const [challenge, setChallenge] = useState(null); // { challengeId, quotes }
  const [answers, setAnswers] = useState({}); // quoteId -> { optionId, correct, correctOptionId }
  const [hints, setHints] = useState({});
  const [hintedQuotes, setHintedQuotes] = useState([]);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(null); // optionId solto no espaço, ainda não confirmado
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [shakeFor, setShakeFor] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [phaseScore, setPhaseScore] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const book = await openBook(slug);
        const data = await get(`/books/${slug}/phase-1`);
        if (!alive) return;
        const map = Object.fromEntries(data.progress.answers.map((a) => [a.quoteId, a]));
        setBookTitle(book.title);
        setChallenge({ challengeId: data.challengeId, quotes: data.quotes });
        setAnswers(map);
        setHintedQuotes(data.progress.hintedQuotes ?? []);
        setPhaseScore(data.progress.completed ? data.progress.score : null);
        const firstOpen = data.quotes.findIndex((q) => !map[q.quoteId]);
        setIndex(firstOpen === -1 ? 0 : firstOpen); // volta de onde parou
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const quotes = challenge?.quotes ?? [];
  const quote = quotes[index];
  const answer = quote ? answers[quote.quoteId] : null;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = quotes.length > 0 && answeredCount >= quotes.length;
  const isLast = index === quotes.length - 1;
  const optionById = useMemo(() => new Map((quote?.options ?? []).map((o) => [o.optionId, o])), [quote]);

  const noticeTimer = useRef(null);
  const flash = useCallback((msg) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
  }, []);

  function goTo(i) {
    setIndex(i);
    setPending(null);
    setDragOver(false);
  }

  function next() {
    if (!answer) return;
    if (allAnswered && isLast) return navigate(routeForPhase(slug, 2));
    const nextOpen = quotes.findIndex((q, i) => i > index && !answers[q.quoteId]);
    goTo(nextOpen !== -1 ? nextOpen : Math.min(index + 1, quotes.length - 1));
  }

  async function confirm() {
    if (!pending || busy || answer) return;
    setBusy(true);
    try {
      const res = await post(`/books/${slug}/phase-1/validate`, {
        challengeId: challenge.challengeId,
        associations: [{ quoteId: quote.quoteId, optionId: pending }],
      });
      const r = res.evaluatedResults.find((x) => x.quoteId === quote.quoteId);
      setAnswers((a) => ({ ...a, [quote.quoteId]: { optionId: pending, correct: !!r?.correct, correctOptionId: r?.correctOptionId } }));
      setPending(null);
      if (!r?.correct) {
        setShakeKey((k) => k + 1);
        setShakeFor(quote.quoteId);
        flash('Não foi dessa vez. Veja qual era a associação certa.');
      }
      if (res.allCompleted) {
        setPhaseScore(res.phase1Score ?? null);
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.65 }, disableForReducedMotion: true });
      }
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function askHint() {
    if (!quote || answer) return;
    try {
      const res = await post(`/books/${slug}/phase-1/hint`, { quoteId: quote.quoteId });
      setHints((h) => ({ ...h, [quote.quoteId]: res.hintText }));
      setHintedQuotes((h) => (h.includes(quote.quoteId) ? h : [...h, quote.quoteId]));
    } catch (e) {
      flash(e.message);
    }
  }

  function place(optionId) {
    if (answer || busy) return;
    setPending(optionId);
  }

  const shell = (children) => (
    <div className="min-h-screen flex flex-col bg-wood-950 bg-[url('/assets/scenes/quotes-bg.jpeg')] bg-cover bg-center bg-fixed">
      <Header title={bookTitle} currentPhase={1} />
      <div className="flex-1 bg-black/45">{children}</div>
    </div>
  );

  if (loading) return shell(<p className="p-10 text-center font-serif text-amber-200">Abrindo a escrivaninha…</p>);
  if (error || !quote) {
    return shell(
      <div className="p-10 text-center">
        <p role="alert" className="mb-4 text-red-200">{error || 'Nenhuma citação encontrada.'}</p>
        <button type="button" className="rounded border border-amber-700/60 px-4 py-2 text-amber-200" onClick={() => navigate('/')}>
          Voltar ao Hub
        </button>
      </div>,
    );
  }

  const chosenId = answer?.optionId ?? pending;
  const chosen = chosenId ? optionById.get(chosenId) : null;
  const hinted = hintedQuotes.includes(quote.quoteId);
  const nextLabel = allAnswered && isLast ? 'Avançar para a Fase 2' : 'Próxima citação';

  return shell(
    <main className="mx-auto max-w-6xl px-4 py-6">
      {notice && (
        <div role="status" className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded border border-amber-600/60 bg-wood-900/95 px-4 py-2 text-sm text-amber-100 shadow-xl">
          {notice}
        </div>
      )}

      <nav aria-label="Citações" className="mb-5 flex items-center justify-center gap-2">
        {quotes.map((q, i) => {
          const a = answers[q.quoteId];
          return (
            <button
              key={q.quoteId}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Citação ${i + 1}${a ? (a.correct ? ', acertou' : ', errou') : ''}`}
              aria-current={i === index}
              className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold transition ${
                i === index ? 'scale-110 border-amber-300 bg-amber-500 text-wood-950' : a ? (a.correct ? 'border-emerald-500 bg-emerald-900/70 text-emerald-100' : 'border-red-500 bg-red-950/70 text-red-100') : 'border-amber-800/60 bg-wood-900/80 text-amber-200'
              }`}
            >
              {a ? (a.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />) : i + 1}
            </button>
          );
        })}
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
        {/* Esquerda: citação e espaço de associação */}
        <section className="flex flex-col items-center gap-4">
          <TornPaperQuote>
            <p className="font-serif text-[17px] italic leading-snug">“{quote.quote}”</p>
            {quote.context && <p className="mt-3 text-[11px] leading-snug opacity-75">{quote.context}</p>}
            {quote.narrativeVoice && <p className="mt-1 text-[10px] uppercase tracking-widest opacity-60">{quote.narrativeVoice}</p>}
          </TornPaperQuote>

          <div
            key={shakeKey}
            onDragOver={(e) => {
              if (answer) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              place(e.dataTransfer.getData('text/plain'));
            }}
            aria-label="Espaço da associação"
            className={`w-full max-w-[320px] rounded-lg border-2 p-3 text-sm transition ${shakeFor === quote.quoteId && answer && !answer.correct ? 'animate-shake' : ''} ${
              answer ? (answer.correct ? 'border-emerald-500 bg-emerald-950/70' : 'border-red-500 bg-red-950/70') : dragOver ? 'border-amber-300 bg-amber-900/50 shadow-glow-amber' : chosen ? 'border-amber-500 bg-wood-900/90' : 'border-dashed border-amber-700/70 bg-wood-900/60'
            }`}
          >
            {chosen ? (
              <>
                <p className="leading-snug text-amber-50">{chosen.text}</p>
                {!answer && (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={confirm} className="flex-1 rounded bg-amber-500 px-3 py-2 text-xs font-bold text-wood-950 hover:bg-amber-400 disabled:opacity-50">
                      {busy ? 'Conferindo…' : 'Confirmar associação'}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setPending(null)} className="rounded border border-amber-700/60 px-3 py-2 text-xs text-amber-200 hover:bg-amber-900/40">
                      Trocar
                    </button>
                  </div>
                )}
                {answer && (
                  <p className={`mt-2 text-xs font-bold ${answer.correct ? 'text-emerald-300' : 'text-red-300'}`}>
                    {answer.correct ? 'Associação correta!' : 'Associação incorreta.'}
                  </p>
                )}
              </>
            ) : (
              <p className="py-4 text-center text-amber-200/70">Arraste uma alternativa até aqui</p>
            )}
          </div>
          {!answer && <p className="max-w-[320px] text-center text-[11px] text-amber-200/60">No celular, toque em uma alternativa para colocá-la no espaço.</p>}
        </section>

        {/* Direita: pergunta, dica e alternativas */}
        <section className="space-y-4">
          <div className="rounded-lg border border-amber-900/50 bg-wood-900/85 p-5 backdrop-blur-sm">
            <p className="font-serif text-lg text-amber-100">{quote.associationQuestion}</p>
            {!answer && (
              <div className="mt-3">
                <button type="button" onClick={askHint} className="inline-flex items-center gap-2 rounded border border-amber-700/50 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/30">
                  <Lightbulb className="h-4 w-4" />
                  {hinted ? 'Rever dica' : 'Pedir dica (custa pontos)'}
                </button>
                {hints[quote.quoteId] && <p className="mt-3 border-l-2 border-amber-500 pl-3 text-sm italic text-amber-100/90">{hints[quote.quoteId]}</p>}
              </div>
            )}
          </div>

          <ul className="space-y-2">
            {quote.options.map((o) => {
              const isChosen = chosenId === o.optionId;
              const isCorrectOne = answer && answer.correctOptionId === o.optionId;
              const isWrongPick = answer && !answer.correct && answer.optionId === o.optionId;
              return (
                <li key={o.optionId}>
                  <button
                    type="button"
                    draggable={!answer && !busy}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', o.optionId)}
                    onClick={() => place(o.optionId)}
                    disabled={!!answer}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm leading-snug transition ${
                      isCorrectOne ? 'border-emerald-400 bg-emerald-900/60 text-emerald-50' : isWrongPick ? 'border-red-400 bg-red-950/70 text-red-100' : isChosen ? 'border-amber-400 bg-amber-900/40 text-amber-50 opacity-60' : answer ? 'border-amber-950 bg-wood-900/60 text-amber-100/50' : 'cursor-grab border-amber-800/60 bg-wood-900/85 text-amber-50 hover:border-amber-400 hover:bg-amber-950/60 active:cursor-grabbing'
                    }`}
                  >
                    {o.text}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} className="inline-flex items-center gap-1 rounded border border-amber-800/60 px-3 py-2 text-xs text-amber-200 hover:bg-amber-900/30 disabled:opacity-30">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <p className="text-xs text-amber-200/70">
              {answeredCount} de {quotes.length} respondidas
              {allAnswered && phaseScore != null && ` · ${phaseScore} pontos`}
            </p>
            <button
              type="button"
              disabled={!answer}
              onClick={next}
              className="inline-flex items-center gap-2 rounded bg-amber-500 px-4 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {nextLabel} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </main>,
  );
}
