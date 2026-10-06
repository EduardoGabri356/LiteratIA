import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { Award, Clock, Home } from 'lucide-react';
import Header from '../components/Header';
import { ApiError, post, routeForPhase } from '../services/api';
import { useGameStore } from '../store/useGameStore';

const fmtTime = (s) => `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;

export default function VictoryScreen() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { rewards, setReward, loadSession } = useGameStore();
  const [data, setData] = useState(rewards[slug] ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    if (data) return undefined;
    // complete é idempotente: serve tanto para registrar quanto para recarregar a tela de vitória.
    post(`/books/${slug}/complete`)
      .then((r) => {
        if (!alive) return;
        setReward(slug, r);
        setData(r);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === 'NOT_APPROVED') navigate(`/game/${slug}/debate`, { replace: true });
        else if (e instanceof ApiError && (e.code === 'PHASE_LOCKED' || e.code === 'BOOK_NOT_STARTED')) navigate(routeForPhase(slug, 1), { replace: true });
        else setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [slug, data, navigate, setReward]);

  useEffect(() => {
    if (data) confetti({ particleCount: 160, spread: 90, origin: { y: 0.4 }, disableForReducedMotion: true });
  }, [data]);

  async function backToHub() {
    await loadSession();
    navigate('/');
  }

  if (error) {
    return (
      <div className="min-h-screen bg-wood-950"><Header />
        <p role="alert" className="p-10 text-center text-red-200">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen bg-wood-950"><Header /><p className="p-10 text-center font-serif text-amber-200">Preparando sua recompensa…</p></div>;

  const { summary, rewards: r } = data;
  return (
    <div className="min-h-screen bg-wood-950">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-10 text-center">
        <h1 className="font-serif text-3xl font-bold text-amber-200">Obra concluída!</h1>

        <div className="flex items-end gap-8">
          <div>
            <p className="font-serif text-6xl font-bold text-amber-300">{summary.finalScore}</p>
            <p className="text-xs uppercase tracking-widest text-amber-400">pontos</p>
          </div>
          <div>
            <p className="font-serif text-6xl font-bold text-emerald-300">{summary.grade}</p>
            <p className="text-xs uppercase tracking-widest text-amber-400">nota</p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-amber-200/80"><Clock className="h-4 w-4" /> {fmtTime(summary.totalTimeSeconds)}</p>

        <section className="grid w-full gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-700/50 bg-wood-900/80 p-5">
            <p className="mb-3 text-[11px] uppercase tracking-widest text-amber-400">Selo dourado</p>
            <Reward src={r.badgeUrl} fallback={<Award className="h-16 w-16 text-amber-400" />} />
          </div>
          <div className="rounded-lg border border-amber-700/50 bg-wood-900/80 p-5">
            <p className="mb-3 text-[11px] uppercase tracking-widest text-amber-400">Action figure</p>
            <Reward src={r.actionFigure.thumbnailUrl} fallback={<Award className="h-16 w-16 text-amber-400/60" />} />
            <p className="mt-3 font-serif text-sm font-bold text-amber-100">{r.actionFigure.name}</p>
            <p className="text-[11px] text-amber-200/50">Visualizador 3D em breve.</p>
          </div>
        </section>

        <button type="button" onClick={backToHub} className="inline-flex items-center gap-2 rounded bg-amber-500 px-6 py-3 font-bold text-wood-950 hover:bg-amber-400">
          <Home className="h-4 w-4" /> Voltar ao Hub
        </button>
      </main>
    </div>
  );
}

function Reward({ src, fallback }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="mx-auto grid h-32 w-32 place-items-center overflow-hidden rounded-lg bg-wood-950">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain" /> : fallback}
    </div>
  );
}
