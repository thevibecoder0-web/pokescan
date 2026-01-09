
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-red-500/20 transition-all duration-300 flex flex-col h-full">
      {/* Visual Header / Card Image */}
      <div className="relative aspect-[2.5/3.5] bg-slate-950 overflow-hidden">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        
        {/* Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-400 font-mono">{card.number}</span>
            <button
              onClick={() => onRemove(card.id)}
              className="p-1.5 bg-red-600/20 hover:bg-red-600 text-white rounded-lg transition-colors backdrop-blur-sm"
              title="Remove from Vault"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Minimal Bottom Label */}
      <div className="px-3 py-2 bg-slate-900 flex flex-col">
        <h3 className="font-orbitron font-bold text-white text-[12px] truncate leading-tight uppercase tracking-wide">
          {card.name}
        </h3>
        <p className="text-[10px] text-slate-500 font-medium truncate opacity-60">
          {card.set}
        </p>
      </div>
    </div>
  );
};

export default CardItem;
