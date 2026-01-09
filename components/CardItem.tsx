
import React from 'react';
import { PokemonCard } from '../types';

interface CardItemProps {
  card: PokemonCard;
  onRemove: (id: string) => void;
}

const CardItem: React.FC<CardItemProps> = ({ card, onRemove }) => {
  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-red-500/30 transition-all duration-500 flex flex-col h-full transform hover:-translate-y-1">
      {/* High Fidelity Image Container */}
      <div className="relative aspect-[2.5/3.5] bg-slate-950 overflow-hidden">
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        
        {/* Subtle Number Tag */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-mono text-slate-400 border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
          #{card.number}
        </div>

        {/* Action Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <div className="flex justify-between items-center">
            {card.sourceUrl ? (
              <a 
                href={card.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1.5 bg-blue-600/20 hover:bg-blue-600 text-white rounded-lg transition-colors backdrop-blur-sm"
                title="View Source"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </a>
            ) : <div />}
            <button
              onClick={() => onRemove(card.id)}
              className="p-1.5 bg-red-600/20 hover:bg-red-600 text-white rounded-lg transition-colors backdrop-blur-sm"
              title="Remove"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Label Area */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <h3 className="font-orbitron font-bold text-white text-[11px] truncate uppercase tracking-widest leading-none">
          {card.name}
        </h3>
        <p className="text-[9px] text-slate-500 font-bold truncate mt-1 uppercase tracking-tighter opacity-70">
          {card.set}
        </p>
      </div>
    </div>
  );
};

export default CardItem;
