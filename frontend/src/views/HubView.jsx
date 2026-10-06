import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Lock, Trophy, X } from 'lucide-react';
import Header from '../components/Header';
import { SHELF_CONFIG } from '../config/shelf';
import { useGameStore } from '../store/useGameStore';
import { openBook, routeForPhase } from '../services/api';

const STATUS_LABEL = { NOT_STARTED: 'Não iniciado', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído' };

export default function HubView() {
  const navigate = useNavigate();
  const { books, loaded, loading, error, loadSession } = useGameStore();
  const [trophyOpen, setTrophyOpen] = useState(false);
  const [replayBook, setReplayBook] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const collected = books.filter((b) => b.actionFigureUnlocked);

  async function start(book, { forceReset = false } = {}) {
    setBusy(true);
    setOpenError('');
    try {
      const p = await openBook(book.slug, forceReset);
      navigate(routeForPhase(book.slug, p.currentPhase));
    } catch (e) {
      setOpenError(e.message);
      setBusy(false);
    }
  }

  function pick(book) {
    if (busy) return;
    if (book.status === 'COMPLETED') setReplayBook(book);
    else start(book);
  }

  return (
    <div className="min-h-screen flex flex-col bg-wood-950">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="mb-4 text-center">
          <h1 className="font-serif text-3xl font-bold text-amber-200 tracking-wide">O Desafio do Vestibular</h1>
          <p className="text-sm text-amber-100/70 mt-1">Escolha uma obra na estante. Os livros que brilham estão esperando por você.</p>
        </div>

        {(error || openError) && (
          <p role="alert" className="mb-3 rounded border border-red-800/60 bg-red-950/60 px-4 py-2 text-sm text-red-200">
            {openError || error}{' '}
            {error && (
              <button type="button" className="underline" onClick={loadSession}>
                Tentar de novo
              </button>
            )}
          </p>
        )}

        <div className="relative w-full max-w-5xl rounded-lg shadow-2xl" style={{ aspectRatio: SHELF_CONFIG.aspect }}>
          <img src={SHELF_CONFIG.bgImage} alt="Estante de livros" className="absolute inset-0 h-full w-full rounded-lg border border-amber-900/40 object-fill" draggable={false} />
          {!loaded && loading && <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-amber-200 font-serif">Abrindo a estante…</div>}

          {SHELF_CONFIG.books.map(({ slug, position }) => {
            const book = bySlug.get(slug);
            if (!book) return null;
            const p = position;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => pick(book)}
                disabled={busy}
                aria-label={`${book.title}, ${STATUS_LABEL[book.status] ?? ''}`}
                className="group absolute rounded-sm outline-none transition focus-visible:ring-2 focus-visible:ring-amber-300 hover:shadow-glow-amber hover:bg-amber-200/10 hover:-translate-y-1 cursor-pointer"
                style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%` }}
              >
                {book.badgeUnlocked && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 p-1 text-wood-950 shadow-glow-amber">
                    <Award className="h-4 w-4" />
                  </span>
                )}
                <span className={`pointer-events-none absolute left-1/2 ${p.top > 50 ? 'bottom-full mb-2' : 'top-full mt-2'} z-20 hidden w-52 -translate-x-1/2 rounded border border-amber-700/50 bg-wood-900/95 px-3 py-2 text-center group-hover:block group-focus-visible:block`}>
                  <span className="block font-serif text-sm font-bold text-amber-100">{book.title}</span>
                  <span className="block text-[11px] text-amber-200/70">{book.author}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-widest text-amber-400">
                    {STATUS_LABEL[book.status]}
                    {book.status === 'IN_PROGRESS' && ` · Fase ${book.currentPhase}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setTrophyOpen(true)}
          className="mt-5 flex items-center gap-2 rounded border border-amber-700/50 bg-wood-800 px-4 py-2 text-sm text-amber-200 hover:bg-amber-900/30"
        >
          <Trophy className="h-4 w-4 text-amber-400" />
          Sala de troféus ({collected.length}/{SHELF_CONFIG.books.length})
        </button>
      </main>

      {trophyOpen && (
        <Modal onClose={() => setTrophyOpen(false)} title="Sala de troféus">
          <ul className="grid gap-3 sm:grid-cols-3">
            {SHELF_CONFIG.books.map(({ slug }) => {
              const b = bySlug.get(slug);
              if (!b) return null;
              const fig = b.actionFigure;
              return (
                <li key={slug} className="rounded border border-amber-900/40 bg-wood-950/70 p-3 text-center">
                  <div className="mx-auto mb-2 grid h-24 w-24 place-items-center overflow-hidden rounded bg-wood-800">
                    {fig ? (
                      <img src={fig.thumbnailUrl} alt={fig.name} className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    ) : (
                      <Lock className="h-6 w-6 text-amber-900" />
                    )}
                    {fig && <Award className="absolute h-8 w-8 text-amber-400/60" />}
                  </div>
                  <p className="font-serif text-xs font-bold text-amber-100">{fig ? fig.name : 'Bloqueado'}</p>
                  <p className="text-[10px] text-amber-200/60">{b.title}</p>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {replayBook && (
        <Modal onClose={() => setReplayBook(null)} title={replayBook.title}>
          <p className="mb-4 text-sm text-amber-100/80">Você já concluiu esta obra. Sua recompensa continua guardada, mesmo que jogue de novo.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-wood-950 hover:bg-amber-400" onClick={() => navigate(`/game/${replayBook.slug}/victory`)}>
              Ver recompensa
            </button>
            <button type="button" className="rounded border border-amber-700/60 px-4 py-2 text-sm text-amber-200 hover:bg-amber-900/30" onClick={() => start(replayBook, { forceReset: true })}>
              Jogar de novo (zera o progresso do livro)
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-xl rounded-lg border border-amber-800/50 bg-wood-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="absolute right-3 top-3 text-amber-300/70 hover:text-amber-200" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 font-serif text-xl font-bold text-amber-200">{title}</h2>
        {children}
      </div>
    </div>
  );
}
