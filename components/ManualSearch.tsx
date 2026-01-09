
import React, { useState } from 'react';
import { manualCardLookup } from '../services/geminiService';
import { PokemonCard } from '../types';

interface ManualSearchProps {
  onAddCard: (card: PokemonCard) => void;
}

const FEATURED_CARDS = [
  { 
    name: "Charizard", 
    detail: "Base Set 4/102", 
    image: "https://images.pokemontcg.io/base1/4_hires.png" 
  },
  { 
    name: "Umbreon VMAX", 
    detail: "Evolving Skies 215/203", 
    image: "https://images.pokemontcg.io/swsh7/215_hires.png" 
  },
  { 
    name: "Giratina V", 
    detail: "Lost Origin 186/196", 
    image: "https://images.pokemontcg.io/swsh11/186_hires.png" 
  },
  { 
    name: "Rayquaza VMAX", 
    detail: "Evolving Skies 218/203", 
    image: "https://images.pokemontcg.io/swsh7/218_hires.png" 
  },
  { 
    name: "Gengar VMAX", 
    detail: "Fusion Strike 271/264", 
    image: "https://images.pokemontcg.io/swsh8/271_hires.png" 
  }
];

const ManualSearch: React.FC<ManualSearchProps> = ({ onAddCard }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PokemonCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performLookup = async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await manualCardLookup(searchQuery);
      if (data && data.name) {
        const newCard: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          ...data,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: data.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(data.name)}`
        };
        setResult(newCard);
      } else {
        setError("Card data could not be verified. Try adding the set name or a different number.");
      }
    } catch (err) {
      setError("Connectivity issue. If this persists, verify your API key and connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    performLookup(query);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-12 pb-12">
      {/* Search Bar Container */}
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 blur-[80px] rounded-full" />
        
        <h2 className="text-3xl font-orbitron font-bold mb-2 tracking-tighter">DATA LOOKUP</h2>
        <p className="text-slate-400 text-sm mb-8 font-medium uppercase tracking-[0.1em]">Synchronize with global TCG database</p>
        
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 relative z-10">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Charizard 004/165"
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-red-500 transition-all font-bold placeholder:text-slate-700 shadow-inner"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-10 py-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap uppercase tracking-widest text-sm"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Searching...
              </>
            ) : (
              "Query Database"
            )}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-950/20 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            {error}
          </div>
        )}
      </div>

      {/* Featured Targets: Binder Aesthetic */}
      <div className="space-y-6">
        <div className="flex items-center gap-4 px-2">
           <h3 className="text-[10px] font-orbitron font-bold text-slate-500 uppercase tracking-[0.4em] whitespace-nowrap">High-Value Database Targets</h3>
           <div className="h-px bg-slate-800 flex-1" />
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {FEATURED_CARDS.map((card) => (
            <button
              key={card.name}
              onClick={() => performLookup(`${card.name} ${card.detail}`)}
              disabled={loading}
              className="group flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-red-500/40 transition-all duration-500 transform hover:-translate-y-2 text-center disabled:opacity-50 disabled:translate-y-0"
            >
              <div className="relative aspect-[2.5/3.5] bg-slate-950 overflow-hidden flex items-center justify-center border-b border-slate-800/50">
                <img 
                  src={card.image} 
                  alt={card.name} 
                  className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110" 
                  onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/400x560/1e293b/white?text=Target'}
                />
                <div className="absolute inset-0 bg-red-600/0 group-hover:bg-red-600/5 transition-colors duration-500" />
              </div>
              <div className="p-3 bg-slate-900 flex flex-col items-center">
                <span className="font-orbitron font-bold text-white text-[9px] truncate uppercase tracking-widest w-full">
                  {card.name}
                </span>
                <span className="text-[7px] text-slate-500 uppercase tracking-tighter mt-1 truncate w-full">
                  {card.detail}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Search Result Overlay/Section */}
      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col md:flex-row bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="w-full md:w-[40%] aspect-[2.5/3.5] bg-slate-950 relative border-r border-slate-800/50 flex items-center justify-center">
              <img src={result.imageUrl} alt={result.name} className="w-full h-full object-contain" />
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg tracking-widest">FOUND</span>
                {result.sourceUrl && (
                  <a href={result.sourceUrl} target="_blank" rel="noopener" className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg tracking-widest flex items-center gap-1">
                    SOURCE
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  </a>
                )}
              </div>
            </div>

            <div className="flex-1 p-8 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-3xl font-orbitron font-bold text-white mb-2 uppercase tracking-tighter">{result.name}</h3>
                    <p className="text-red-500 font-black uppercase tracking-widest text-[10px] flex items-center gap-2">
                      {result.type} <span className="w-1 h-1 bg-slate-700 rounded-full" /> {result.set}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Number</div>
                    <div className="text-xl font-orbitron font-bold text-white">{result.number}</div>
                  </div>
                </div>

                <div className="space-y-4 py-6 border-y border-slate-800/50">
                   <div className="flex justify-between text-xs font-bold">
                     <span className="text-slate-500 uppercase tracking-widest">Rarity</span>
                     <span className="text-slate-200">{result.rarity}</span>
                   </div>
                   <div className="flex justify-between text-xs font-bold">
                     <span className="text-slate-500 uppercase tracking-widest">Health Points</span>
                     <span className="text-slate-200">{result.hp || "N/A"}</span>
                   </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => onAddCard(result)}
                  className="flex-1 bg-white hover:bg-slate-200 text-slate-950 font-black py-4 rounded-2xl transition-all shadow-xl active:scale-95 uppercase tracking-[0.2em] text-xs"
                >
                  Save to Vault
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualSearch;
