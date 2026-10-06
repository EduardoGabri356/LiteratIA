import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Gavel, Send } from 'lucide-react';
import Header from '../components/Header';
import { ApiError, get, openBook, post } from '../services/api';
import { useGameStore } from '../store/useGameStore';

const RUBRIC_LABELS = { coherence: 'Coerência textual', bookKnowledge: 'Domínio da obra', argumentation: 'Capacidade argumentativa' };

export default function DebateView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const setReward = useGameStore((s) => s.setReward);
  const feedEnd = useRef(null);

  const [bookTitle, setBookTitle] = useState('');
  const [trial, setTrial] = useState(null);
  const [messages, setMessages] = useState([]); // { role: 'user' | 'critic', text, transient? }
  const [evaluation, setEvaluation] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const book = await openBook(slug);
        const data = await get(`/books/${slug}/phase-3`);
        if (!alive) return;
        setBookTitle(book.title);
        setTrial(data);
        setMessages(data.debate.messages.map(({ role, text }) => ({ role, text })));
        setEvaluation(data.debate.finished ? data.debate.evaluation : null);
        setError('');
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, evaluation]);

  const turn = messages.filter((m) => m.role === 'user' && !m.transient).length + 1;
  const finished = !!evaluation;
  const min = trial?.minChars ?? 100;
  const max = trial?.maxChars ?? 2000;
  const length = input.trim().length;
  const canSend = !busy && !finished && length >= min && length <= max;

  async function send() {
    if (!canSend) return;
    const text = input.trim();
    setBusy(true);
    setFormError('');
    try {
      const res = await post(`/books/${slug}/phase-3/debate`, { turn, userArgument: text });
      if (res.isValidArgument === false) {
        // Argumento recusado: o turno não é gasto e o texto continua na caixa para o aluno corrigir.
        setMessages((m) => [...m.filter((x) => !x.transient), { role: 'critic', text: res.criticResponse, transient: true }]);
        return;
      }
      setMessages((m) => [...m.filter((x) => !x.transient), { role: 'user', text }, { role: 'critic', text: res.criticResponse }]);
      setInput('');
      if (res.isFinalEvaluation) {
        setEvaluation(res.evaluation);
        if (res.evaluation.approved) {
          // Registra a conclusão e guarda a recompensa (idempotente; a tela de vitória repete se falhar).
          post(`/books/${slug}/complete`).then((r) => setReward(slug, r)).catch(() => {});
        }
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'WRONG_TURN' || e.code === 'DEBATE_FINISHED')) reload();
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      await post(`/books/${slug}/phase-3/retry`);
      setInput('');
      reload();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (children) => (
    <div className="min-h-screen flex flex-col bg-wood-950 bg-[url('/assets/scenes/Tribunal.jpeg')] bg-cover bg-center bg-fixed">
      <Header title={bookTitle} currentPhase={3} />
      <div className="flex-1 bg-black/60">{children}</div>
    </div>
  );

  if (loading) return shell(<p className="p-10 text-center font-serif text-amber-200">O tribunal está se reunindo…</p>);
  if (error || !trial) {
    return shell(
      <div className="p-10 text-center">
        <p role="alert" className="mb-4 text-red-200">{error || 'Julgamento não encontrado.'}</p>
        <button type="button" className="rounded border border-amber-700/60 px-4 py-2 text-amber-200" onClick={() => navigate('/')}>Voltar ao Hub</button>
      </div>,
    );
  }

  const criticName = trial.literaryCriticName || 'O Crítico';

  return shell(
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <section className="rounded-lg border border-amber-800/50 bg-wood-900/90 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Avatar url={trial.avatarUrl} name={criticName} />
          <div>
            <p className="text-[11px] uppercase tracking-widest text-amber-400">{trial.title}</p>
            <p className="font-serif text-sm text-amber-200/80">{criticName} preside o julgamento</p>
          </div>
        </div>
        <p className="mt-4 font-serif text-lg leading-snug text-amber-50">{trial.premiseText}</p>
        <p className="mt-2 text-xs text-amber-200/60">Dois turnos: um argumento inicial e uma tréplica. No fim, o crítico avalia o debate inteiro.</p>
      </section>

      <section aria-live="polite" className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg border px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'border-parchment-300/60 bg-parchment-200 text-[#3b2a18]' : `border-amber-700/60 bg-wood-900/95 text-amber-50 ${m.transient ? 'italic opacity-90' : ''}`}`}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">{m.role === 'user' ? 'Você' : criticName}</p>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          </div>
        ))}
        {busy && !finished && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-amber-700/60 bg-wood-900/95 px-4 py-3 text-sm italic text-amber-200/80">{criticName} está escrevendo…</div>
          </div>
        )}
      </section>

      {evaluation && (
        <section className="rounded-lg border border-amber-500/60 bg-wood-900/95 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-amber-400">Veredito</p>
              <p className={`font-serif text-2xl font-bold ${evaluation.approved ? 'text-emerald-300' : 'text-red-300'}`}>{evaluation.approved ? 'Aprovado' : 'Reprovado'}</p>
            </div>
            <p className="font-serif text-4xl font-bold text-amber-200">
              {Number(evaluation.score).toFixed(1)}
              <span className="text-lg text-amber-200/60">/10</span>
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {Object.entries(evaluation.rubricBreakdown ?? {}).map(([k, v]) => (
              <li key={k}>
                <div className="flex justify-between text-xs text-amber-100/80">
                  <span>{RUBRIC_LABELS[k] ?? k}</span>
                  <span>{Number(v).toFixed(1)}</span>
                </div>
                <div className="h-2 rounded bg-wood-950">
                  <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.min(100, Number(v) * 10)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-amber-50">{evaluation.feedbackText}</p>
          {evaluation.evaluatedBy === 'fallback' && <p className="mt-2 text-xs text-amber-300/80">O avaliador de IA estava indisponível; esta nota veio de uma checagem automática simples.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {evaluation.approved ? (
              <button type="button" onClick={() => navigate(`/game/${slug}/victory`)} className="rounded bg-amber-500 px-5 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400">
                Receber a recompensa
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={retry} className="rounded bg-amber-500 px-5 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400 disabled:opacity-50">
                Tentar o julgamento de novo
              </button>
            )}
          </div>
        </section>
      )}

      {!finished && (
        <section className="rounded-lg border border-amber-800/50 bg-wood-900/90 p-4 backdrop-blur-sm">
          <label htmlFor="argument" className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-200">
            <Gavel className="h-4 w-4 text-amber-400" />
            {turn === 1 ? 'Seu argumento inicial' : 'Sua tréplica'}
          </label>
          <textarea
            id="argument"
            value={input}
            disabled={busy}
            rows={5}
            maxLength={max + 200}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fundamente-se na estrutura narrativa da obra…"
            className="w-full resize-y rounded border border-amber-900/60 bg-wood-950 p-3 text-sm text-amber-50 outline-none focus:border-amber-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className={`text-xs ${length < min || length > max ? 'text-amber-300/80' : 'text-emerald-300'}`}>
              {length} caracteres {length < min ? `(mínimo ${min})` : length > max ? `(máximo ${max})` : ''}
            </p>
            <button type="button" disabled={!canSend} onClick={send} className="inline-flex items-center gap-2 rounded bg-amber-500 px-4 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40">
              <Send className="h-4 w-4" />
              {turn === 1 ? 'Submeter argumento ao crítico' : 'Enviar tréplica'}
            </button>
          </div>
          {formError && <p role="alert" className="mt-2 text-sm text-red-300">{formError}</p>}
        </section>
      )}
      <div ref={feedEnd} />
    </main>,
  );
}

function Avatar({ url, name }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt="" onError={() => setFailed(true)} className="h-12 w-12 rounded-full border border-amber-600/60 object-cover" />;
  }
  return <span className="grid h-12 w-12 place-items-center rounded-full border border-amber-600/60 bg-wood-800 font-serif text-lg font-bold text-amber-300">{name.trim().charAt(0)}</span>;
}
