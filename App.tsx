
import React, { useState, useEffect } from 'react';
import Scanner from './components/Scanner';
import CardItem from './components/CardItem';
import ManualSearch from './components/ManualSearch';
import { PokemonCard } from './types';

type ViewMode = 'collection' | 'scanner' | 'manual';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('collection');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('poke_collection');
    if (saved) {
      try {
        setCollection(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved collection");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('poke_collection', JSON.stringify(collection));
  }, [collection]);

  const addCard = (card: PokemonCard, shouldSwitchView = false) => {
    setCollection(prev => [card, ...prev]);
    if (shouldSwitchView) {
      setViewMode('collection');
    }
  };

  const removeCard = (id: string) => {
    setCollection(prev => prev.filter(card => card.id !== id));
  };

  const filteredCollection = collection.filter(card => 
    card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.set.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-4 z-50 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)] cursor-pointer hover:rotate-180 transition-transform duration-500" onClick={() => setViewMode('collection')}>
                <div className="w-8 h-8 rounded-full border-4 border-slate-950 flex items-center justify-center bg-white">
                    <div className="w-2 h-2 bg-slate-950 rounded-full"></div>
                </div>
            </div>
            <h1 className="hidden xs:block text-xl md:text-2xl font-orbitron font-bold tracking-tighter text-white">
              POKÉ<span className="text-red-500">SCAN</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('scanner')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl font-bold text-[11px] transition-all active:scale-95 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 ${
                  viewMode === 'scanner' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
                <span>SCANNER</span>
              </button>

              <button
                onClick={() => setViewMode('manual')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl font-bold text-[11px] transition-all active:scale-95 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 ${
                  viewMode === 'manual' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <span>DATABASE</span>
              </button>

              <button
                onClick={() => setViewMode('collection')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl font-bold text-[11px] transition-all active:scale-95 flex flex-col sm:flex-row items-center gap-1 sm:gap-2 ${
                  viewMode === 'collection' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                <span>VAULT</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto w-full flex flex-col ${viewMode === 'scanner' ? 'p-0 max-w-none' : 'px-4 py-6 max-w-7xl mx-auto'}`}>
        {viewMode === 'scanner' && (
          <div className="flex-1 w-full h-full animate-in fade-in duration-300">
            <Scanner 
                isScanning={true} 
                setIsScanning={(val) => !val && setViewMode('collection')} 
                onCardDetected={(card) => addCard(card, false)} 
            />
          </div>
        )}

        {viewMode === 'manual' && (
          <div className="animate-in fade-in zoom-in duration-300">
             <ManualSearch onAddCard={(card) => addCard(card, true)} />
          </div>
        )}

        {viewMode === 'collection' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-orbitron font-bold text-white tracking-tight flex items-center gap-3">
                  VAULT RECORDS
                  <span className="text-[10px] bg-red-600/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded uppercase tracking-[0.2em]">Live Bind</span>
                </h2>
                <p className="text-slate-500 text-xs mt-1">Total Assets: {collection.length}</p>
              </div>
              
              <div className="w-full sm:w-auto relative">
                <input
                  type="text"
                  placeholder="Filter Vault..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-10 text-sm focus:outline-none focus:border-red-500 transition-all sm:w-64"
                />
                <svg className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>

            {filteredCollection.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                {filteredCollection.map(card => (
                  <CardItem key={card.id} card={card} onRemove={removeCard} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800">
                <div className="w-16 h-16 mb-4 text-slate-800">
                  <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-400">Vault Empty</h3>
                <p className="text-slate-600 max-w-xs text-center text-xs mb-6 px-4">
                  {searchQuery ? "No cards match your filter." : "Start your collection by scanning cards."}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setViewMode('scanner')} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-lg transition-all shadow-lg active:scale-95 uppercase tracking-widest">
                    Scan Card
                  </button>
                  <button onClick={() => setViewMode('manual')} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-lg transition-all shadow-lg active:scale-95 uppercase tracking-widest">
                    Manual Search
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="md:hidden bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 sticky bottom-0 left-0 right-0 z-50 shrink-0">
        <div className="flex justify-around items-center h-20 px-2">
          <button 
            onClick={() => setViewMode('collection')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${viewMode === 'collection' ? 'text-blue-500' : 'text-slate-500'}`}
          >
            <div className={`p-2 rounded-xl ${viewMode === 'collection' ? 'bg-blue-500/10' : ''}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tight">Vault</span>
          </button>
          
          <button 
            onClick={() => setViewMode('scanner')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${viewMode === 'scanner' ? 'text-red-500' : 'text-slate-500'}`}
          >
             <div className={`p-2 rounded-xl ${viewMode === 'scanner' ? 'bg-red-500/10' : ''}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tight">Scanner</span>
          </button>

          <button 
            onClick={() => setViewMode('manual')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${viewMode === 'manual' ? 'text-amber-500' : 'text-slate-500'}`}
          >
            <div className={`p-2 rounded-xl ${viewMode === 'manual' ? 'bg-amber-500/10' : ''}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tight">Database</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
