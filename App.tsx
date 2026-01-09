
import React, { useState, useEffect } from 'react';
import Scanner from './components/Scanner';
import CardItem from './components/CardItem';
import { PokemonCard } from './types';

type ViewMode = 'collection' | 'scanner';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('collection');
  const [searchQuery, setSearchQuery] = useState('');

  // Load collection from local storage on mount
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

  // Save collection to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('poke_collection', JSON.stringify(collection));
  }, [collection]);

  const addCard = (card: PokemonCard) => {
    setCollection(prev => [card, ...prev]);
    // Stay in scanner mode or switch back? 
    // Usually, after scanning one, user might want to see it or scan another.
    // Let's stay in scanner but maybe show a temporary "Success" toast (handled in Scanner usually)
    // For now, let's switch back to collection to show the new card.
    setViewMode('collection');
  };

  const removeCard = (id: string) => {
    setCollection(prev => prev.filter(card => card.id !== id));
  };

  const filteredCollection = collection.filter(card => 
    card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.set.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                <div className="w-8 h-8 rounded-full border-4 border-slate-950 flex items-center justify-center bg-white">
                    <div className="w-2 h-2 bg-slate-950 rounded-full"></div>
                </div>
            </div>
            <h1 className="text-xl md:text-2xl font-orbitron font-bold tracking-tighter text-white">
              POKÉ<span className="text-red-500">SCAN</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-full py-1.5 px-8 text-sm focus:outline-none focus:border-red-500 transition-colors w-40 md:w-64"
              />
              <svg className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            
            <button
              onClick={() => setViewMode(viewMode === 'collection' ? 'scanner' : 'collection')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all active:scale-95 shadow-lg ${
                viewMode === 'scanner' ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {viewMode === 'collection' ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  <span className="hidden xs:inline">SCAN CARD</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                  <span className="hidden xs:inline">COLLECTION</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:py-8 max-w-7xl mx-auto w-full">
        {viewMode === 'scanner' ? (
          <div className="h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
             <div className="w-full max-w-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-orbitron font-bold">CARD ANALYZER</h2>
                    <button 
                      onClick={() => setViewMode('collection')}
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-semibold"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      Close
                    </button>
                </div>
                <Scanner 
                   isScanning={true} 
                   setIsScanning={(val) => !val && setViewMode('collection')} 
                   onCardDetected={addCard} 
                />
             </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-orbitron font-bold flex items-center gap-3">
                MY COLLECTION
                <span className="bg-slate-800 text-slate-400 text-sm font-bold px-3 py-1 rounded-full font-sans">
                  {collection.length}
                </span>
              </h2>
            </div>

            {filteredCollection.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {filteredCollection.map(card => (
                  <CardItem key={card.id} card={card} onRemove={removeCard} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800">
                <div className="w-20 h-20 mb-6 text-slate-800">
                  <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-400 mb-2">No Cards Saved</h3>
                <p className="text-slate-600 max-w-xs text-center text-sm mb-6">
                  {searchQuery ? "Try a different search term." : "Your Pokédex is currently empty. Start scanning cards to build your digital vault."}
                </p>
                <button
                  onClick={() => setViewMode('scanner')}
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all shadow-lg active:scale-95"
                >
                  Enter Scanner Mode
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navigation Footer (Mobile Only) */}
      <nav className="md:hidden bg-slate-950 border-t border-slate-800 fixed bottom-0 left-0 right-0 z-50">
        <div className="flex justify-around items-center h-16">
          <button 
            onClick={() => setViewMode('collection')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${viewMode === 'collection' ? 'text-red-500' : 'text-slate-500'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
            <span className="text-[10px] font-bold uppercase">Vault</span>
          </button>
          
          <button 
            onClick={() => setViewMode('scanner')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${viewMode === 'scanner' ? 'text-red-500' : 'text-slate-500'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path></svg>
            <span className="text-[10px] font-bold uppercase">Scanner</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
