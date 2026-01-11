
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Scanner from './components/Scanner';
import { PokemonCard } from './types';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [notifications, setNotifications] = useState<{id: number, text: string, type?: 'error' | 'success'}[]>([]);
  const [view, setView] = useState<'scanner' | 'vault'>('scanner');
  const [isProcessing, setIsProcessing] = useState(false);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('ultra_vault_collection');
    if (saved) setCollection(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('ultra_vault_collection', JSON.stringify(collection));
  }, [collection]);

  const addNotification = useCallback((text: string, type: 'error' | 'success' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text, type }]);
    
    if (Notification.permission === "granted") {
      new Notification(type === 'error' ? "PokéScan: Engine Error" : "PokéScan Elite", { 
        body: text,
        icon: type === 'error' ? '/error-icon.png' : '/success-icon.png'
      });
    }
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, type === 'error' ? 6000 : 4000);
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
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
    
    setCollection(prev => [newCard, ...prev]);
    addNotification(`Asset Registered: ${newCard.name} - $${newCard.marketPrice.toFixed(2)}`);
  }, [addNotification]);

  const handleScanError = useCallback((error: any) => {
    const msg = error?.message || String(error);
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      addNotification("Neural Engine Saturated (Quota Reached). Retrying momentarily...", "error");
    } else {
      addNotification("Neural Sync Interrupted. Check connection.", "error");
    }
  }, [addNotification]);

  const totalValue = useMemo(() => 
    collection.reduce((sum, card) => sum + card.marketPrice, 0), 
  [collection]);

  const deleteCard = (id: string) => {
    setCollection(prev => prev.filter(c => c.id !== id));
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
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Neural Engine: Online</p>
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
        {view === 'scanner' ? (
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
                  <h4 className="font-orbitron text-xs font-bold uppercase tracking-widest">Rapid Identification</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Optimized for reliability & accuracy</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Session Captures</p>
                <p className="text-xl font-orbitron font-black text-white">{collection.length}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
            <div className="flex items-center justify-between gap-4">
               <h2 className="text-4xl font-orbitron font-black uppercase tracking-tighter">Secure Vault</h2>
               <div className="h-px bg-slate-800 flex-1 opacity-30" />
               <span className="bg-slate-900 px-6 py-2 rounded-full border border-white/10 text-xs font-black text-slate-400 uppercase tracking-widest">{collection.length} Records</span>
            </div>
            
            {collection.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center text-slate-700 border-2 border-dashed border-slate-800 rounded-[3rem]">
                <svg className="w-20 h-20 mb-6 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                <p className="font-orbitron font-bold uppercase tracking-[0.3em]">Vault Empty: Initialize Scan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {collection.map(card => (
                  <div key={card.id} className="group bg-slate-900/40 backdrop-blur-md rounded-[2.5rem] overflow-hidden border border-white/5 transition-all duration-500 hover:shadow-[0_0_40px_rgba(220,38,38,0.1)] hover:-translate-y-2 relative">
                    <div className="aspect-[2.5/3.5] relative bg-black/40 overflow-hidden">
                      <img 
                        src={card.imageUrl} 
                        className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110 p-2" 
                        alt={card.name} 
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/400x560/1e293b/white?text=SYNC_ERROR';
                        }}
                      />
                      <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black text-green-400 border border-green-500/20 shadow-lg">
                        ${card.marketPrice.toFixed(2)}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="p-5 flex flex-col gap-1">
                      <h3 className="text-xs font-orbitron font-black truncate uppercase tracking-tight text-white">{card.name}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[70%]">{card.set}</span>
                        <button 
                          onClick={() => deleteCard(card.id)}
                          className="text-red-500/40 hover:text-red-500 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="p-6 bg-slate-900 border-t border-white/5 flex gap-6 sticky bottom-0 z-50 backdrop-blur-2xl">
        <button 
          onClick={() => setView('scanner')}
          className={`flex-1 py-5 rounded-[2rem] font-orbitron font-black text-xs uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-3 ${view === 'scanner' ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.4)]' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          Neural Scan
        </button>
        <button 
          onClick={() => setView('vault')}
          className={`flex-1 py-5 rounded-[2rem] font-orbitron font-black text-xs uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-3 ${view === 'vault' ? 'bg-cyan-600 text-white shadow-[0_0_30px_rgba(8,145,178,0.4)]' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Vault Records
        </button>
      </nav>

      {/* Notifications Portal */}
      <div className="fixed top-28 right-6 z-[100] flex flex-col gap-4 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`bg-slate-900/98 backdrop-blur-2xl border ${n.type === 'error' ? 'border-red-500/50' : 'border-cyan-500/30'} px-8 py-6 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-in slide-in-from-right-full duration-500 pointer-events-auto flex items-center gap-5 min-w-[320px]`}>
            <div className={`w-12 h-12 ${n.type === 'error' ? 'bg-red-600' : 'bg-cyan-500'} rounded-2xl flex items-center justify-center shadow-lg`}>
              {n.type === 'error' ? (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              ) : (
                <svg className="w-7 h-7 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
            <div>
              <p className={`text-[10px] ${n.type === 'error' ? 'text-red-400' : 'text-cyan-400'} font-black uppercase tracking-[0.4em] mb-1`}>
                {n.type === 'error' ? 'System Warning' : 'Asset Registered'}
              </p>
              <p className="text-sm font-orbitron font-bold text-white tracking-tight">{n.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
