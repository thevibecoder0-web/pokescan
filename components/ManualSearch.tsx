
import React, { useState, useMemo } from 'react';
import { manualCardLookup, fetchCardsFromSet } from '../services/geminiService';
import { PokemonCard, IdentificationResult } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

interface ManualSearchProps {
  onAddCard: (card: PokemonCard) => void;
}

const RECENT_SETS = [
  { 
    name: "Surging Sparks", 
    id: "sv8", 
    logo: "https://images.pokemontcg.io/sv8/logo.png",
    isPreloaded: true
  },
  { 
    name: "Prismatic Evolutions", 
    id: "sv85", 
    logo: "https://images.pokemontcg.io/sv85/logo.png",
    isPreloaded: false
  },
  { 
    name: "Stellar Crown", 
    id: "sv7", 
    logo: "https://images.pokemontcg.io/sv7/logo.png",
    isPreloaded: false
  }
];

const ManualSearch: React.FC<ManualSearchProps> = ({ onAddCard }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSet, setLoadingSet] = useState(false);
  const [result, setResult] = useState<PokemonCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [setCards, setSetCards] = useState<Partial<IdentificationResult>[]>([]);

  const getCardSortNumber = (numStr?: string): number => {
    if (!numStr) return 9999;
    const match = numStr.match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 9999;
  };

  const sortedSetCards = useMemo(() => {
    return [...setCards].sort((a, b) => getCardSortNumber(a.number) - getCardSortNumber(b.number));
  }, [setCards]);

  const performLookup = async (searchQuery: string, preloadedData?: IdentificationResult) => {
    setLoading(true);
    setError(null);
    setResult(null);

    // If preloaded but missing price, we still trigger AI to get the live value
    const finalSearchQuery = selectedSet === "Surging Sparks" 
      ? `surging sparks card #${searchQuery} tcgplayer market price`
      : `${searchQuery} pokemon card market value tcgplayer`;

    try {
      const data = await manualCardLookup(finalSearchQuery);
      if (data && data.name) {
        setResult({
          id: Math.random().toString(36).substr(2, 9),
          ...data,
          // If we had local data but AI failed to get image, merge them
          imageUrl: data.imageUrl || preloadedData?.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(data.name)}`,
          scanDate: new Date().toLocaleDateString(),
        });
      } else {
        setError("Card data not found in archives.");
      }
    } catch (err) {
      setError("AI Engine response error. Check connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetSelect = async (setName: string) => {
    setSelectedSet(setName);
    if (setName === "Surging Sparks") {
      setSetCards(SURGING_SPARKS_DATA);
      return;
    }

    setLoadingSet(true);
    try {
      const cards = await fetchCardsFromSet(setName);
      setSetCards(cards || []);
    } catch (err) {
      setError("Failed to synchronize set archives.");
    } finally {
      setLoadingSet(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-12 pb-12">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-red-600/20 blur-[120px] rounded-full" />
        <h2 className="text-4xl font-orbitron font-bold mb-4 tracking-tighter">TCG DATABASE ACCESS</h2>
        <p className="text-slate-500 text-sm mb-8 font-bold uppercase tracking-widest">Identify cards and retrieve real-time market values.</p>
        
        <form onSubmit={(e) => { e.preventDefault(); performLookup(query); }} className="flex flex-col sm:flex-row gap-4 relative z-10">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Name or Card Number (e.g. Pikachu 036)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-white focus:outline-none focus:ring-2 focus:ring-red-600 font-bold transition-all text-lg shadow-inner"
          />
          <button type="submit" disabled={loading} className="px-12 py-5 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-xl uppercase tracking-[0.2em] text-sm transition-all active:scale-95 disabled:opacity-50">
            {loading ? "Decrypting..." : "Scan Database"}
          </button>
        </form>
        {error && <p className="mt-4 text-red-500 font-bold text-xs uppercase tracking-widest text-center">{error}</p>}
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between gap-6 px-4">
          <h3 className="text-[11px] font-orbitron font-bold text-slate-500 uppercase tracking-[0.5em]">
            {selectedSet ? `Exploration: ${selectedSet}` : 'Set Archives'}
          </h3>
          {selectedSet && (
            <button onClick={() => { setSelectedSet(null); setSetCards([]); }} className="text-[11px] font-black text-red-500 hover:text-red-400 uppercase tracking-[0.2em] flex items-center gap-2 transition-all group">
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              Return to Catalog
            </button>
          )}
          <div className="h-px bg-slate-800/50 flex-1" />
        </div>
        
        {!selectedSet ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
            {RECENT_SETS.map((set) => (
              <button key={set.id} onClick={() => handleSetSelect(set.name)} className="group bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden hover:shadow-red-600/40 transition-all duration-700 transform hover:-translate-y-3">
                <div className="aspect-video bg-slate-950 p-8 border-b border-slate-800/50 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <img src={set.logo} alt={set.name} className="w-full h-full object-contain transition-transform group-hover:scale-125 duration-700 relative z-10" />
                </div>
                <div className="p-6 bg-slate-900">
                  <span className="font-orbitron font-bold text-white text-[10px] uppercase tracking-[0.3em] block text-center group-hover:text-red-500 transition-colors">{set.name}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {loadingSet ? (
              Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2.5/3.5] bg-slate-900/50 rounded-3xl animate-pulse border border-slate-800/50" />)
            ) : (
              sortedSetCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => performLookup(card.number || card.name || "", card as any)}
                  className="group flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden hover:shadow-red-600/30 transition-all duration-500 transform hover:-translate-y-2"
                >
                  <div className="aspect-[2.5/3.5] bg-slate-950 border-b border-slate-800/50 relative">
                    <img 
                      src={card.imageUrl} 
                      alt={card.name} 
                      className="w-full h-full object-contain p-2 transition-transform duration-700 group-hover:scale-110" 
                      onError={(e) => (e.target as HTMLImageElement).src = 'https://placehold.co/400x560/1e293b/white?text=Syncing+Data'} 
                    />
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-black text-slate-400 border border-white/5">
                      #{card.number?.split('/')[0]}
                    </div>
                  </div>
                  <div className="p-4 text-center bg-slate-900">
                    <span className="font-orbitron font-bold text-white text-[10px] truncate block uppercase tracking-tight">{card.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/98 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-[4rem] overflow-hidden shadow-[0_0_120px_rgba(220,38,38,0.25)] flex flex-col md:flex-row animate-in zoom-in-95 duration-500 border border-white/5">
            <div className="w-full md:w-[40%] aspect-[2.5/3.5] bg-slate-950 p-12 flex items-center justify-center border-r border-slate-800/50 relative overflow-hidden">
               <div className="absolute inset-0 bg-radial-gradient from-red-600/10 to-transparent"></div>
              <img src={result.imageUrl} alt={result.name} className="w-full h-full object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.9)] relative z-10 scale-110" />
            </div>
            <div className="flex-1 p-10 md:p-16 flex flex-col justify-between relative">
              <div>
                <div className="flex justify-between items-start mb-10">
                  <div className="max-w-[70%]">
                    <h3 className="text-5xl md:text-6xl font-orbitron font-bold text-white mb-4 uppercase tracking-tighter leading-none">{result.name}</h3>
                    <div className="flex items-center gap-3">
                      <span className="bg-red-600 text-white font-black uppercase text-[10px] tracking-[0.3em] px-3 py-1 rounded-lg">SV8 SPARKS</span>
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{result.type} ELEMENT</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Market Price</div>
                    <div className="text-4xl font-orbitron font-bold text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.3)]">{result.marketValue || "$??.??"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-10 py-12 border-y border-slate-800/50">
                   <div className="space-y-2">
                      <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest block opacity-70">Vitality Core</span>
                      <span className="text-3xl font-orbitron font-bold text-slate-200">{result.hp || "---"} HP</span>
                   </div>
                   <div className="space-y-2">
                      <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest block opacity-70">Rarity Tier</span>
                      <span className="text-slate-100 font-bold uppercase text-sm tracking-[0.2em] bg-white/5 px-3 py-1 rounded-lg inline-block border border-white/10">{result.rarity}</span>
                   </div>
                </div>
                
                <div className="mt-8">
                   <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest block opacity-70 mb-4">Set Archives Number</span>
                   <span className="text-xl font-orbitron font-bold text-white">#{result.number} / 191</span>
                </div>
              </div>
              
              <div className="mt-16 flex gap-6">
                <button 
                  onClick={() => { onAddCard(result); setResult(null); }} 
                  className="flex-1 bg-white hover:bg-red-600 hover:text-white text-slate-950 font-black py-7 rounded-[2.5rem] uppercase text-[13px] tracking-[0.5em] transition-all shadow-2xl active:scale-95 border-none"
                >
                  Confirm to Vault
                </button>
                <button 
                  onClick={() => setResult(null)} 
                  className="px-12 bg-slate-950 hover:bg-slate-800 text-white font-bold py-7 rounded-[2.5rem] transition-all active:scale-95 border border-white/10 shadow-xl"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
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
