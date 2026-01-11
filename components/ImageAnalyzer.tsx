
import React, { useState, useRef } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';

interface ImageAnalyzerProps {
  onAddCard: (card: PokemonCard) => void;
  initialImage?: string | null;
}

const ImageAnalyzer: React.FC<ImageAnalyzerProps> = ({ onAddCard, initialImage }) => {
  const [image, setImage] = useState<string | null>(initialImage || null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PokemonCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (base64: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    const base64Data = base64.split(',')[1];
    try {
      const data = await identifyPokemonCard(base64Data);
      if (data) {
        setResult({
          id: Math.random().toString(36).substr(2, 9),
          ...data,
          imageUrl: base64, // Use original high-res upload
          scanDate: new Date().toLocaleDateString(),
        });
      } else {
        setError("NEURAL_RECOGNITION_FAILED: Analysis inconclusive. Try better lighting.");
      }
    } catch (err) {
      setError("AI_ENGINE_OFFLINE: Connection to Gemini Pro failed.");
    } finally {
      setLoading(false);
    }
  };

  // Automatically process if initialImage is provided
  React.useEffect(() => {
    if (initialImage) {
      processImage(initialImage);
    }
  }, [initialImage]);

  return (
    <div className="w-full max-w-4xl mx-auto py-8">
      {!image ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-96 bg-slate-900/50 border-4 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/50 transition-all duration-500 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <svg className="w-20 h-20 text-slate-700 group-hover:text-cyan-400 mb-6 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <h3 className="text-xl font-orbitron font-bold text-slate-400 group-hover:text-white uppercase tracking-tighter transition-colors">Neural Upload Portal</h3>
          <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] mt-4">Drop asset or click to initialize</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="relative aspect-[2.5/3.5] bg-slate-900 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
              <img src={image} className="w-full h-full object-cover" alt="Upload" />
              {loading && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-24 h-24 border-b-4 border-cyan-500 rounded-full animate-spin mb-8 shadow-[0_0_30px_rgba(34,211,238,0.5)]"></div>
                  <h3 className="text-2xl font-orbitron font-black text-cyan-400 tracking-tighter animate-pulse">PRO_MODEL_ANALYSIS</h3>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mt-4">Extracting neural features from visual stream...</p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between">
              {result ? (
                <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl flex-1 animate-in slide-in-from-right-10 duration-500">
                  <span className="text-cyan-400 font-orbitron font-black text-[10px] uppercase tracking-[0.5em] block mb-6">Neural_Identification_Locked</span>
                  <h2 className="text-4xl md:text-5xl font-orbitron font-black text-white uppercase tracking-tighter leading-none mb-8">{result.name}</h2>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between py-4 border-b border-slate-800">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Market Value</span>
                      <span className="text-2xl font-orbitron font-black text-green-400">{result.marketValue}</span>
                    </div>
                    <div className="flex justify-between py-4 border-b border-slate-800">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Set Reference</span>
                      <span className="text-sm font-bold text-white uppercase">{result.set}</span>
                    </div>
                    <div className="flex justify-between py-4 border-b border-slate-800">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Card ID</span>
                      <span className="text-sm font-bold text-white uppercase">#{result.number}</span>
                    </div>
                  </div>

                  <div className="mt-12 flex gap-4">
                    <button 
                      onClick={() => { onAddCard(result); setImage(null); setResult(null); }}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.3em] transition-all active:scale-95"
                    >
                      Store in Vault
                    </button>
                    <button 
                      onClick={() => { setImage(null); setResult(null); }}
                      className="px-8 bg-slate-800 hover:bg-slate-700 text-white font-bold py-5 rounded-2xl transition-all"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full bg-slate-900/40 rounded-[2.5rem] border border-slate-800 border-dashed flex items-center justify-center p-12 text-center text-slate-600">
                  {!loading && "Select an asset to begin high-fidelity analysis."}
                </div>
              )}
            </div>
          </div>
          {error && <p className="text-red-500 font-orbitron font-black text-[10px] uppercase tracking-widest text-center bg-red-500/10 py-4 rounded-2xl border border-red-500/20">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default ImageAnalyzer;
