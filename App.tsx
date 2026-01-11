
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Scanner from './components/Scanner';
import CardItem from './components/CardItem';
import ManualSearch from './components/ManualSearch';
import { PokemonCard } from './types';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [notifications, setNotifications] = useState<{id: number, text: string, type?: 'error' | 'success'}[]>([]);
  const [view, setView] = useState<'scanner' | 'vault' | 'manual'>('scanner');
  const [isProcessing, setIsProcessing] = useState(false);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('ultra_vault_collection');
    if (saved) {
      try {
        setCollection(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load collection", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ultra_vault_collection', JSON.stringify(collection));
  }, [collection]);

  const addNotification = useCallback((text: string, type: 'error' | 'success' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text, type }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, type === 'error' ? 6000 : 4000);
  }, []);

  const handleCardDetected = useCallback((cardData: Partial<PokemonCard>) => {
    const newCard: PokemonCard = {
      id: Math.random().toString(36).substr(2, 9),
      name: cardData.name || "Unknown",
      set: cardData.set || "Unknown Set",
      number: cardData.number || "???",
      rarity: cardData.rarity || "Rare",
      imageUrl: cardData.imageUrl || "", 
      marketPrice: cardData.marketPrice || 0,
      currency: "USD",
      timestamp: Date.now()
    };
    
    // Avoid immediate duplicate scans
    setCollection(prev => {
      if (prev.some(c => c.name === newCard.name && c.number === newCard.number)) {
        return prev;
      }
      addNotification(`Asset Registered: ${newCard.name}`);
      return [newCard, ...prev];
    });
  }, [addNotification]);

  const handleScanError = useCallback((error: any) => {
    addNotification("Scanner Engine Alert: Calibration Required", "error");
  }, [addNotification]);

  const totalValue = useMemo(() => 
    collection.reduce((sum, card) => sum + (card.marketPrice || 0), 0), 
  [collection]);

  const deleteCard = (id: string) => {
    setCollection(prev => prev.filter(c => c.id !== id));
    addNotification("Asset Decommissioned", "success");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-roboto flex flex-col">
      {/* Status Bar */}
      <header className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-2xl sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)]">
            <div className="w-11 h-11 border-[6px] border-slate-950 rounded-full flex items-center justify-center bg-white">
              <div className="w-3 h-3 bg-slate-950 rounded-full animate-pulse" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-orbitron font-black tracking-tighter italic">ULTRA<span className="text-red-600">SCAN</span></h1>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Local Engine: Active</p>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 opacity-60">Vault Portfolio Value</p>
          <p className="text-3xl font-orbitron font-black text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.3)]">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-8 overflow-hidden">
        {view === 'scanner' && (
          <div className="flex-1 min-h-0 flex flex-col gap-6">
            <div className="flex-1">
              <Scanner 
                onCardDetected={handleCardDetected} 
                onScanError={handleScanError}
                isProcessing={isProcessing} 
                setIsProcessing={setIsProcessing} 
              />
            </div>
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-cyan-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h4 className="font-orbitron text-xs font-bold uppercase tracking-widest">Local OCR Protocol</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Zero API Limits / Unlimited Scans</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Session Records</p>
                <p className="text-xl font-orbitron font-black text-white">{collection.length}</p>
              </div>
            </div>
          </div>
        )}

        {view === 'vault' && (
          <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
            <div className="flex items-center justify-between gap-4">
               <h2 className="text-4xl font-orbitron font-black uppercase tracking-tighter">Secure Vault</h2>
               <div className="h-px bg-slate-800 flex-1 opacity-30" />
               <span className="bg-slate-900 px-6 py-2 rounded-full border border-white/10 text-xs font-black text-slate-400 uppercase tracking-widest">{collection.length} Assets</span>
            </div>
            
            {collection.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center text-slate-700 border-2 border-dashed border-slate-800 rounded-[3rem]">
                <svg className="w-20 h-20 mb-6 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                <p className="font-orbitron font-bold uppercase tracking-[0.3em]">No Assets Found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {collection.map(card => (
                  <CardItem key={card.id} card={card} onRemove={deleteCard} />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'manual' && (
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <ManualSearch onAddCard={handleCardDetected} />
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="p-6 bg-slate-900 border-t border-white/5 flex gap-4 sticky bottom-0 z-50 backdrop-blur-2xl">
        <button 
          onClick={() => setView('scanner')}
          className={`flex-1 py-5 rounded-[2rem] font-orbitron font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${view === 'scanner' ? 'bg-red-600 text-white shadow-xl shadow-red-600/20' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          Scanner
        </button>
        <button 
          onClick={() => setView('manual')}
          className={`flex-1 py-5 rounded-[2rem] font-orbitron font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${view === 'manual' ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-600/20' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          Search
        </button>
        <button 
          onClick={() => setView('vault')}
          className={`flex-1 py-5 rounded-[2rem] font-orbitron font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${view === 'vault' ? 'bg-slate-200 text-slate-900 shadow-xl' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Vault
        </button>
      </nav>

      {/* Notifications Portal */}
      <div className="fixed top-28 right-6 z-[100] flex flex-col gap-4 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`bg-slate-950 border ${n.type === 'error' ? 'border-red-500/50' : 'border-cyan-500/30'} px-6 py-4 rounded-[2rem] shadow-2xl animate-in slide-in-from-right-full duration-500 pointer-events-auto flex items-center gap-4 min-w-[280px]`}>
            <div className={`w-10 h-10 ${n.type === 'error' ? 'bg-red-600' : 'bg-cyan-500'} rounded-2xl flex items-center justify-center`}>
              {n.type === 'error' ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
            <div>
              <p className={`text-[9px] ${n.type === 'error' ? 'text-red-400' : 'text-cyan-400'} font-black uppercase tracking-[0.2em]`}>
                {n.type === 'error' ? 'Alert' : 'Status'}
              </p>
              <p className="text-xs font-orbitron font-bold text-white tracking-tight">{n.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
