
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl hover:shadow-red-500/10 transition-all duration-500 flex flex-col h-full">
      {/* Visual Header */}
      <div className="relative aspect-[2.5/3.5] bg-slate-800">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        
        {/* Top Info Bar Overlay */}
        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-[10px] font-orbitron font-bold text-white uppercase tracking-wider">{card.type}</span>
            <h3 className="font-orbitron font-bold text-white text-lg leading-tight">{card.name}</h3>
          </div>
          <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg">
            {card.hp || 'N/A'}
          </span>
        </div>

        {/* Set Info Overlay */}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <span className="bg-black/60 backdrop-blur-md text-[9px] px-2 py-0.5 rounded-md text-slate-300 border border-white/5 font-mono">
            {card.number}
          </span>
        </div>
      </div>
      
      {/* Card Details / Stats */}
      <div className="p-4 flex flex-col flex-1 bg-slate-900">
        {/* Abilities Section */}
        {card.abilities && card.abilities.length > 0 && (
          <div className="mb-3">
            <h4 className="text-[10px] uppercase font-orbitron text-red-500 mb-1 tracking-widest">Abilities</h4>
            <div className="flex flex-wrap gap-1">
              {card.abilities.map((ability, idx) => (
                <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  {ability}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Attacks Section */}
        {card.attacks && card.attacks.length > 0 && (
          <div className="mb-4 flex-1">
            <h4 className="text-[10px] uppercase font-orbitron text-red-500 mb-2 tracking-widest">Attacks</h4>
            <div className="space-y-2">
              {card.attacks.map((attack, idx) => (
                <div key={idx} className="border-l-2 border-slate-800 pl-2">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[11px] font-bold text-white">{attack.name}</span>
                    <span className="text-[11px] font-black text-red-400">{attack.damage}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight line-clamp-2">{attack.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta & Footer */}
        <div className="pt-3 mt-auto border-t border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
             <span className="text-[9px] text-slate-500 font-medium truncate max-w-[100px]">{card.set}</span>
             {card.sourceUrl && (
               <a 
                 href={card.sourceUrl} 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 className="text-[9px] text-blue-400 hover:underline mt-0.5 flex items-center gap-1"
               >
                 Official Source
                 <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
               </a>
             )}
          </div>
          <button
            onClick={() => onRemove(card.id)}
            className="p-1.5 text-slate-600 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/5"
            title="Remove"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardItem;
