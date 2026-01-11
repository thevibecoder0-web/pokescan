
import React, { useState, useEffect, useCallback } from 'react';
import Scanner from './components/Scanner';
import { PokemonCard } from './types';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [notifications, setNotifications] = useState<{id: number, text: string}[]>([]);
  const [view, setView] = useState<'scanner' | 'vault'>('scanner');

  useEffect(() => {
    const saved = localStorage.getItem('elite_collection');
    if (saved) setCollection(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('elite_collection', JSON.stringify(collection));
  }, [collection]);

  const addNotification = useCallback((text: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

  const handleCardDetected = useCallback((cardData: Partial<PokemonCard>) => {
    const newCard: PokemonCard = {
      id: Math.random().toString(36).substr(2, 9),
      name: cardData.name || "Unknown",
      set: cardData.set || "Unknown Set",
      number: cardData.number || "???",
      rarity: cardData.rarity || "Common",
      imageUrl: cardData.imageUrl || "",
      marketPrice: cardData.marketPrice || 0,
      currency: "USD",
      timestamp: Date.now()
    };
    
    setCollection(prev => [newCard, ...prev]);
    addNotification(`Vault Updated: ${newCard.name} Added!`);
  }, [addNotification]);

  const totalValue = collection.reduce((sum, card) => sum + (card.marketPrice || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-roboto flex flex-col">
      {/* Top Bar */}
      <header className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-600/20">
            <div className="w-10 h-10 border-4 border-slate-950 rounded-full flex items-center justify-center bg-white">
              <div className="w-2 h-2 bg-slate-950 rounded-full" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-orbitron font-bold tracking-tighter">POKÉSCAN <span className="text-red-500">ELITE</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Neural TCG Identification System</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Vault Portfolio Value</p>
          <p className="text-2xl font-orbitron font-black text-green-400">${totalValue.toFixed(2)}</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 max-w-7xl mx-auto w-full gap-6 overflow-hidden">
        {view === 'scanner' ? (
          <div className="flex-1 min-h-0">
            <Scanner onCardDetected={handleCardDetected} onNotification={addNotification} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-orbitron font-bold uppercase tracking-tight">Records Vault</h2>
              <span className="bg-slate-800 px-4 py-1 rounded-full text-xs font-bold text-slate-400">{collection.length} Assets</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {collection.map(card => (
                <div key={card.id} className="bg-slate-900 rounded-2xl overflow-hidden border border-white/5 group relative transform transition-transform hover:-translate-y-2">
                  <div className="aspect-[2.5/3.5] relative bg-black">
                    <img src={card.imageUrl} className="w-full h-full object-contain" alt={card.name} />
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-black text-green-400">
                      ${card.marketPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="text-xs font-orbitron font-bold truncate uppercase tracking-tight">{card.name}</h3>
                    <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{card.set}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="p-4 bg-slate-900 border-t border-white/5 flex gap-4 sticky bottom-0 z-50">
        <button 
          onClick={() => setView('scanner')}
          className={`flex-1 py-4 rounded-2xl font-orbitron font-bold text-xs uppercase tracking-widest transition-all ${view === 'scanner' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-slate-800 text-slate-500'}`}
        >
          Neural Scan
        </button>
        <button 
          onClick={() => setView('vault')}
          className={`flex-1 py-4 rounded-2xl font-orbitron font-bold text-xs uppercase tracking-widest transition-all ${view === 'vault' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' : 'bg-slate-800 text-slate-500'}`}
        >
          Records Vault
        </button>
      </nav>

      {/* Instant Notifications */}
      <div className="fixed top-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-5 h-5 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm font-orbitron font-bold tracking-tight">{n.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
