import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import Header from '../components/Header';
import { get, openBook, post } from '../services/api';

// Fase 2. Os hotspots vêm do servidor em % da imagem (1376x768); o palco tem exatamente essa proporção,
// então as caixas acompanham o desenho em qualquer tamanho de tela.
const ASPECT = '1376 / 768';

export default function PointAndClickView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const calibrate = params.get('calibrate') === '1';

  const [bookTitle, setBookTitle] = useState('');
  const [scene, setScene] = useState(null);
  const [status, setStatus] = useState({}); // hotspotId -> 'correct' | 'wrong'
  const [progress, setProgress] = useState({ totalHotspots: 0, answeredCount: 0, completed: false });
  const [showHints, setShowHints] = useState(false);
  const [modal, setModal] = useState(null); // { hotspot, question, result|null }
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const book = await openBook(slug);
        const data = await get(`/books/${slug}/phase-2`);
        if (!alive) return;
        setBookTitle(book.title);
        setScene(data);
        setStatus(Object.fromEntries(data.hotspots.filter((h) => h.status).map((h) => [h.id, h.status])));
        setProgress(data.progress);
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

  // Elementos menores por cima, para um hotspot dentro de outro continuar clicável.
  const ordered = useMemo(() => [...(scene?.hotspots ?? [])].sort((a, b) => b.coords.width * b.coords.height - a.coords.width * a.coords.height), [scene]);
  const done = progress.completed || (progress.totalHotspots > 0 && progress.answeredCount >= progress.totalHotspots);

  async function openHotspot(h) {
    if (calibrate) return;
    setModalError('');
    setSelected(null);
    try {
      const data = await get(`/books/${slug}/phase-2/hotspot/${h.id}`);
      setModal({ hotspot: h, question: data.question, result: data.alreadyAnswered ? data.result : null });
      if (data.alreadyAnswered) setSelected(data.result.selectedOption);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit() {
    if (!selected || busy || modal.result) return;
    setBusy(true);
    setModalError('');
    try {
      const res = await post(`/books/${slug}/phase-2/submit`, {
        hotspotId: modal.hotspot.id,
        questionId: modal.question.questionId,
        selectedOption: selected,
      });
      setModal((m) => ({ ...m, result: res }));
      setStatus((s) => ({ ...s, [modal.hotspot.id]: res.isCorrect ? 'correct' : 'wrong' }));
      setProgress((p) => ({
        ...p,
        answeredCount: res.phase2Progress.answeredCount,
        completed: res.phase2Progress.canTransitionToPhase3,
      }));
    } catch (e) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell title={bookTitle}><p className="p-10 text-center font-serif text-amber-200">Entrando na cena…</p></Shell>;
  if (error || !scene) {
    return (
      <Shell title={bookTitle}>
        <div className="p-10 text-center">
          <p role="alert" className="mb-4 text-red-200">{error || 'Cena não encontrada.'}</p>
          <button type="button" className="rounded border border-amber-700/60 px-4 py-2 text-amber-200" onClick={() => navigate('/')}>Voltar ao Hub</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={bookTitle}>
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-3 py-4">
        <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-amber-200">
            Elementos investigados: <strong>{progress.answeredCount}</strong> / {progress.totalHotspots}
          </p>
          <button type="button" onClick={() => setShowHints((v) => !v)} className="inline-flex items-center gap-2 rounded border border-amber-800/60 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/30">
            {showHints ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showHints ? 'Esconder pistas' : 'Mostrar pistas'}
          </button>
        </div>

        <div className="relative w-full select-none overflow-visible rounded-lg shadow-2xl" style={{ aspectRatio: ASPECT }}>
          <img src={scene.backgroundImage} alt={`Cena de ${bookTitle}`} className="absolute inset-0 h-full w-full rounded-lg border border-amber-900/40 object-fill" draggable={false} />

          {ordered.map((h) => {
            const st = status[h.id];
            const c = h.coords;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => openHotspot(h)}
                aria-label={`${h.label}${st === 'correct' ? ', acertou' : st === 'wrong' ? ', errou' : ''}`}
                className={`group absolute rounded-md border-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-300 ${
                  st === 'correct' ? 'border-emerald-400/70 bg-emerald-400/10' : st === 'wrong' ? 'border-red-400/70 bg-red-500/10' : showHints || calibrate ? 'hotspot-active border-amber-300/60' : 'border-transparent hover:bg-amber-200/10 hover:shadow-glow-amber hover:border-amber-300/70 focus-visible:border-amber-300/70'
                }`}
                style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.width}%`, height: `${c.height}%` }}
              >
                {st && (
                  <span className={`absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full text-white shadow ${st === 'correct' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {st === 'correct' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </span>
                )}
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-amber-700/50 bg-wood-900/95 px-2 py-1 text-xs text-amber-100 group-hover:block group-focus-visible:block">
                  {calibrate ? `${h.id} [${c.x}, ${c.y}, ${c.width}, ${c.height}]` : h.label}
                </span>
              </button>
            );
          })}

          {calibrate && <Calibrator />}
        </div>

        {done && (
          <div className="mt-5 text-center">
            <button type="button" onClick={() => navigate(`/game/${slug}/debate`)} className="rounded bg-amber-500 px-6 py-3 font-serif text-base font-bold text-wood-950 shadow-glow-amber hover:bg-amber-400">
              Avançar para o Julgamento do Crítico (Fase 3) →
            </button>
          </div>
        )}
        {calibrate && <p className="mt-3 text-xs text-amber-300">Modo de calibração: arraste sobre a imagem para medir um retângulo.</p>}
      </main>

      {modal && (
        <QuestionModal
          modal={modal}
          selected={selected}
          setSelected={setSelected}
          busy={busy}
          error={modalError}
          onSubmit={submit}
          onClose={() => setModal(null)}
        />
      )}
    </Shell>
  );
}

function Shell({ title, children }) {
  return (
    <div className="min-h-screen bg-wood-950">
      <Header title={title} currentPhase={2} />
      {children}
    </div>
  );
}

function QuestionModal({ modal, selected, setSelected, busy, error, onSubmit, onClose }) {
  const { hotspot, question, result } = modal;
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/75 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={hotspot.label} className="relative my-6 w-full max-w-2xl rounded-lg border border-amber-800/50 bg-wood-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute right-3 top-3 text-amber-300/70 hover:text-amber-200">
          <X className="h-5 w-5" />
        </button>
        <p className="text-[11px] uppercase tracking-widest text-amber-400">
          {hotspot.label}
          {question.sourceExam && ` · ${question.sourceExam}${question.examYear ? ` ${question.examYear}` : ''}`}
        </p>
        <p className="mt-2 font-serif text-lg leading-snug text-amber-50">{question.statement}</p>

        <ul className="mt-4 space-y-2">
          {question.options.map((o) => {
            const isCorrect = result && result.correctOption === o.letter;
            const isWrongPick = result && !result.isCorrect && result.selectedOption === o.letter;
            return (
              <li key={o.letter}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 text-sm leading-snug transition ${
                    isCorrect ? 'border-emerald-400 bg-emerald-900/50 text-emerald-50' : isWrongPick ? 'border-red-400 bg-red-950/60 text-red-100' : selected === o.letter ? 'border-amber-400 bg-amber-900/40 text-amber-50' : 'border-amber-900/60 bg-wood-950/60 text-amber-100 hover:border-amber-600'
                  } ${result ? 'cursor-default' : ''}`}
                >
                  <input type="radio" name="option" value={o.letter} checked={selected === o.letter} disabled={!!result} onChange={() => setSelected(o.letter)} className="mt-1 accent-amber-500" />
                  <span>
                    <strong className="mr-1">{o.letter})</strong>
                    {o.text}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

        {result ? (
          <div className={`mt-4 rounded border p-4 text-sm leading-relaxed ${result.isCorrect ? 'border-emerald-600/60 bg-emerald-950/50 text-emerald-50' : 'border-red-700/60 bg-red-950/50 text-red-50'}`}>
            <p className="mb-1 font-bold">
              {result.isCorrect ? 'Resposta correta!' : `Resposta incorreta. A alternativa certa era a ${result.correctOption}.`}
            </p>
            <p>{result.pedagogicalExplanation}</p>
            <button type="button" onClick={onClose} className="mt-3 rounded bg-amber-500 px-4 py-2 text-xs font-bold text-wood-950 hover:bg-amber-400">
              Continuar investigando
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-amber-200/60">A primeira resposta é definitiva.</p>
            <button type="button" disabled={!selected || busy} onClick={onSubmit} className="rounded bg-amber-500 px-5 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400 disabled:opacity-40">
              {busy ? 'Enviando…' : 'Confirmar resposta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Modo ?calibrate=1: arraste sobre a imagem e copie o [x, y, largura, altura] em % para data/coords.json.
function Calibrator() {
  const ref = useRef(null);
  const [rect, setRect] = useState(null);
  const start = useRef(null);
  const pct = (e) => {
    const b = ref.current.getBoundingClientRect();
    const clamp = (n) => Math.min(100, Math.max(0, n));
    return { x: clamp(((e.clientX - b.left) / b.width) * 100), y: clamp(((e.clientY - b.top) / b.height) * 100) };
  };
  const fmt = (r) => [r.x, r.y, r.w, r.h].map((n) => Math.round(n * 10) / 10);
  const text = rect ? JSON.stringify(fmt(rect)) : '';

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-30 cursor-crosshair"
      onPointerDown={(e) => {
        if (e.target !== ref.current) return;
        ref.current.setPointerCapture(e.pointerId);
        start.current = pct(e);
        setRect({ ...start.current, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = pct(e);
        setRect({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) });
      }}
      onPointerUp={() => (start.current = null)}
    >
      {rect && (
        <>
          <div className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/10" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }} />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(text)}
            className="absolute bottom-2 left-2 rounded bg-black/80 px-3 py-1 font-mono text-xs text-cyan-200"
          >
            {text} (copiar)
          </button>
        </>
      )}
    </div>
  );
}
