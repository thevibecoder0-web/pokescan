
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-red-500/40 transition-all duration-500 flex flex-col h-full transform hover:-translate-y-1">
      {/* Visual Card Art */}
      <div className="relative aspect-[2.5/3.5] bg-slate-950 overflow-hidden flex items-center justify-center">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/400x560/1e293b/white?text=Art+Missing';
          }}
        />
        
        {/* Hover Controls */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
          <div className="flex justify-end">
             <button
              onClick={() => onRemove(card.id)}
              className="p-2 bg-red-600/20 hover:bg-red-600 text-white rounded-lg transition-all backdrop-blur-md active:scale-90"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>

          <div className="flex justify-between items-end">
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-black/40 px-2 py-1 rounded">#{card.number}</span>
            {card.sourceUrl && (
              <a 
                href={card.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 bg-blue-600/30 hover:bg-blue-600 text-white rounded-lg transition-all backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </a>
            )}
          </div>
        </div>
      </div>
      
      {/* Minimalistic ID Strip */}
      <div className="p-3 bg-slate-900 flex flex-col items-center">
        <h3 className="font-orbitron font-bold text-white text-[10px] truncate uppercase tracking-widest text-center w-full">
          {card.name}
        </h3>
        <div className="h-0.5 w-8 bg-red-600/30 mt-2 rounded-full group-hover:w-16 transition-all duration-500" />
      </div>
    </div>
  );
};

export default CardItem;
