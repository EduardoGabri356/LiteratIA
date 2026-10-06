
// Pergaminho recortado de card.png (fundo transparente). Fica em retrato, como na arte.
export default function TornPaperQuote({ children, className = '' }) {
  return (
    <div className={`relative aspect-[408/610] w-full max-w-[300px] ${className}`}>
      <img src="/assets/ui/parchment-1.png" alt="" className="absolute inset-0 h-full w-full object-fill drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]" draggable={false} />
      <div className="relative z-10 flex h-full flex-col justify-center px-9 py-12 text-[#3b2a18]">{children}</div>
    </div>
  );
}
