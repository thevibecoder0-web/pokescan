
import React, { useState, useEffect } from 'react';
import Scanner from './components/Scanner';
import CardItem from './components/CardItem';
import { PokemonCard } from './types';

const App: React.FC = () => {
  const [collection, setCollection] = useState<PokemonCard[]>([]);
  const [isScanning, setIsScanning] = useState(false);
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
    setIsScanning(false);
  };

  const removeCard = (id: string) => {
    setCollection(prev => prev.filter(card => card.id !== id));
  };

  const filteredCollection = collection.filter(card => 
    card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.set.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50 px-4 py-4 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                <div className="w-8 h-8 rounded-full border-4 border-slate-950 flex items-center justify-center bg-white">
                    <div className="w-2 h-2 bg-slate-950 rounded-full"></div>
                </div>
            </div>
            <h1 className="text-2xl font-orbitron font-bold tracking-tighter text-white">
              POKÉ<span className="text-red-500">SCAN</span>
            </h1>
          </div>
          
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search collection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-full py-2 px-10 text-sm focus:outline-none focus:border-red-500 transition-colors"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          <button
            onClick={() => setIsScanning(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-full font-bold text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            SCAN CARD
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8">
        {/* Scanner Section */}
        {isScanning && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Scanning Station</h2>
             </div>
             <Scanner 
                isScanning={isScanning} 
                setIsScanning={setIsScanning} 
                onCardDetected={addCard} 
             />
          </div>
        )}

        {/* Collection Grid */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-orbitron font-bold flex items-center gap-3">
              MY COLLECTION
              <span className="bg-slate-800 text-slate-400 text-sm font-bold px-3 py-1 rounded-full font-sans">
                {collection.length}
              </span>
            </h2>
            
            {collection.length > 0 && (
                <div className="flex gap-2">
                    <button className="p-2 text-slate-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path></svg>
                    </button>
                </div>
            )}
          </div>

          {filteredCollection.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredCollection.map(card => (
                <CardItem key={card.id} card={card} onRemove={removeCard} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-800">
              <div className="w-24 h-24 mb-6 text-slate-700">
                <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-300 mb-2">No Cards Found</h3>
              <p className="text-slate-500 max-w-xs text-center">
                {searchQuery ? "No cards match your search criteria." : "Your collection is empty. Start by scanning your first Pokémon card!"}
              </p>
              {!isScanning && (
                <button
                  onClick={() => setIsScanning(true)}
                  className="mt-6 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-full transition-all"
                >
                  Start First Scan
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Floating Scan Button for Mobile */}
      {!isScanning && (
        <button
          onClick={() => setIsScanning(true)}
          className="fixed bottom-8 right-8 md:hidden w-16 h-16 bg-red-600 rounded-full shadow-[0_4px_20px_rgba(220,38,38,0.5)] flex items-center justify-center text-white z-40 active:scale-90 transition-transform"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
        </button>
      )}
    </div>
  );
};

export default App;
