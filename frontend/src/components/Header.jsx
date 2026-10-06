import { useNavigate } from 'react-router-dom';
import { BookOpen, Home } from 'lucide-react';

export default function Header({ title, currentPhase }) {
  const navigate = useNavigate();
  return (
    <header className="w-full bg-wood-900/90 border-b border-amber-900/40 px-6 py-3 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
      <button type="button" className="flex items-center space-x-3" onClick={() => navigate('/')}>
        <BookOpen className="w-6 h-6 text-amber-400" />
        <span className="font-serif font-bold text-lg text-amber-200 tracking-wider">LiteratIA</span>
      </button>

      {title && (
        <div className="text-center">
          <h2 className="font-serif text-sm font-bold text-amber-100">{title}</h2>
          {currentPhase && (
            <span className="text-[10px] text-amber-400/80 uppercase tracking-widest block">Fase {currentPhase}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="p-2 rounded bg-wood-800 hover:bg-amber-900/40 text-amber-200 transition-colors border border-amber-800/40 flex items-center gap-1 text-xs"
        title="Voltar ao Hub"
      >
        <Home className="w-4 h-4" />
        <span className="hidden sm:inline">Hub</span>
      </button>
    </header>
  );
}
