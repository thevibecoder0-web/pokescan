
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
      <div className="aspect-[2.5/3.5] relative overflow-hidden bg-slate-700">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-500"
        />
        <div className="absolute top-2 right-2 flex flex-col gap-2">
            <span className="bg-black/60 backdrop-blur-md text-[10px] px-2 py-0.5 rounded-full text-slate-200 border border-white/10">
                #{card.number}
            </span>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-white truncate text-lg pr-2">{card.name}</h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/20">
            {card.type}
          </span>
        </div>
        
        <p className="text-sm text-slate-400 font-medium truncate mb-2">{card.set}</p>
        
        <div className="flex items-center justify-between mt-4">
          <span className={`text-[10px] uppercase font-black tracking-tighter px-1.5 py-0.5 rounded border ${
            card.rarity.toLowerCase().includes('rare') ? 'border-yellow-500 text-yellow-500' : 'border-slate-600 text-slate-500'
          }`}>
            {card.rarity}
          </span>
          <button
            onClick={() => onRemove(card.id)}
            className="p-2 text-slate-500 hover:text-red-500 transition-colors"
            title="Remove from collection"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardItem;
