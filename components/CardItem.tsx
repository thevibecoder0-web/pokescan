
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl hover:shadow-cyan-400/20 transition-all duration-700 flex flex-col h-full transform hover:-translate-y-4">
      {/* High-Tech Frame Decorations */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/10 rounded-tl-xl z-20 group-hover:border-cyan-400 transition-colors"></div>
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/10 rounded-br-xl z-20 group-hover:border-cyan-400 transition-colors"></div>

      {/* Visual Card Art */}
      <div className="relative aspect-[2.5/3.5] bg-slate-950 overflow-hidden flex items-center justify-center p-3">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-contain transition-transform duration-1000 group-hover:scale-110 group-hover:rotate-2 relative z-10"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/400x560/1e293b/white?text=Sync_Error';
          }}
        />
        
        {/* Glow Effects */}
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-400/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="absolute -inset-10 bg-radial-gradient from-cyan-400/5 to-transparent blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

        {/* Market Value Badge */}
        <div className="absolute top-6 left-6 z-30">
          <div className="bg-slate-950/80 backdrop-blur-md text-green-400 text-[9px] font-orbitron font-black px-4 py-1.5 rounded-full shadow-2xl border border-green-500/30 tracking-widest uppercase">
            {card.marketValue || "$??.??"}
          </div>
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 z-40 bg-slate-950/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-center items-center gap-6 p-8">
            <h4 className="text-xl font-orbitron font-black text-white text-center uppercase tracking-tighter leading-tight">{card.name}</h4>
            
            <div className="flex flex-col items-center gap-2">
                <span className="text-[8px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">Asset_Registry</span>
                <span className="text-xs text-slate-300 font-mono font-bold">SET: {card.set}</span>
                <span className="text-xs text-slate-300 font-mono font-bold">NUM: #{card.number}</span>
            </div>

            <div className="flex gap-4 mt-4">
                 <button
                    onClick={(e) => { e.stopPropagation(); onRemove(card.id); }}
                    className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl transition-all shadow-xl active:scale-90"
                    title="Purge Data"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
                {card.sourceUrl && (
                    <a 
                        href={card.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-4 bg-white/10 hover:bg-cyan-500 text-white rounded-2xl transition-all shadow-xl border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                )}
            </div>
        </div>
      </div>
      
      {/* Static Info Footer */}
      <div className="p-6 bg-slate-900/60 border-t border-white/5 flex flex-col items-center group-hover:bg-slate-800/80 transition-colors">
        <h3 className="font-orbitron font-bold text-white text-[11px] truncate uppercase tracking-[0.2em] text-center w-full group-hover:text-cyan-400 transition-colors">
          {card.name}
        </h3>
        <div className="flex items-center gap-3 mt-2">
            <span className="text-[7px] text-slate-500 font-orbitron font-black uppercase tracking-widest">{card.set}</span>
            <div className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="text-[7px] text-slate-500 font-orbitron font-black uppercase tracking-widest">#{card.number}</span>
        </div>
      </div>
    </div>
  );
};

export default CardItem;
