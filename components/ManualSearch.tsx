
import React, { useState } from 'react';
import { manualCardLookup } from '../services/geminiService';
import { PokemonCard } from '../types';

interface ManualSearchProps {
  onAddCard: (card: PokemonCard) => void;
}

const ManualSearch: React.FC<ManualSearchProps> = ({ onAddCard }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PokemonCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await manualCardLookup(query);
      if (data && data.name && data.name.toLowerCase() !== 'unknown') {
        const newCard: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          ...data,
          scanDate: new Date().toLocaleDateString(),
          // Use the imageUrl from the AI lookup, fallback only if missing
          imageUrl: data.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(data.name + data.number)}/400/600`
        };
        setResult(newCard);
      } else {
        setError("Could not find official TCG data for that card. Check the name and number.");
      }
    } catch (err) {
      setError("An error occurred during search. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <h2 className="text-2xl font-orbitron font-bold mb-2">MANUAL LOOKUP</h2>
        <p className="text-slate-400 text-sm mb-6">Enter card name and number (e.g., <span className="text-red-400">Bisharp 133/198</span> or <span className="text-red-400">Mewtwo 51</span>)</p>
        
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Name & Number..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-red-500 transition-all font-bold"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                SEARCHING...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                RUN LOOKUP
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-950/30 border border-red-500/50 rounded-2xl text-red-400 text-sm font-medium animate-in slide-in-from-top-2 duration-300">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="flex flex-col md:flex-row bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="w-full md:w-1/3 aspect-[2.5/3.5] bg-slate-800 relative">
              <img src={result.imageUrl} alt={result.name} className="w-full h-full object-contain bg-slate-950" />
              <div className="absolute top-4 left-4">
                <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">PREVIEW</span>
              </div>
            </div>

            <div className="flex-1 p-6 sm:p-8 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-3xl font-orbitron font-bold text-white mb-1 uppercase">{result.name}</h3>
                  <p className="text-red-500 font-bold uppercase tracking-widest text-xs">{result.type} • {result.set}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2 text-center">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">HP</div>
                  <div className="text-xl font-orbitron font-bold text-white">{result.hp}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Rarity</div>
                  <div className="text-sm font-bold text-slate-200">{result.rarity}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Number</div>
                  <div className="text-sm font-bold text-slate-200">{result.number}</div>
                </div>
              </div>

              <div className="space-y-4 mb-8 flex-1">
                {result.attacks?.slice(0, 2).map((attack, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-sm font-bold text-slate-300">{attack.name}</span>
                    <span className="text-sm font-black text-red-500">{attack.damage}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex gap-3">
                <button
                  onClick={() => onAddCard(result)}
                  className="flex-1 bg-white hover:bg-slate-200 text-slate-900 font-black py-4 rounded-2xl transition-all shadow-xl active:scale-95 uppercase tracking-widest text-sm"
                >
                  Confirm & Save to Vault
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95"
                >
                  Discard
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
