
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { extractNameLocally } from '../services/ocrService';
import { PokemonCard } from '../types';

interface ScannerProps {
  onCardDetected: (card: PokemonCard) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [flash, setFlash] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'reading' | 'ready'>('idle');

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("OPTICAL_LINK_FAILED");
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isScanning) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isScanning]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setOcrStatus('reading');
    setScanResult(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { alpha: false });

    if (context) {
      // High-res capture for OCR
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullImageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      
      // INFINITE USE LOGIC:
      // 1. Try local OCR first for the name. This uses device CPU, so it's free and infinite.
      const localName = await extractNameLocally(canvas.toDataURL('image/jpeg', 0.9));
      
      if (localName) {
        console.log("Local OCR Success:", localName);
        setOcrStatus('ready');
      }

      // 2. Call Gemini for Price and Verification (Using high-limit Flash model)
      const result = await identifyPokemonCard(fullImageBase64, false);

      if (result && result.name) {
        setScanResult({
          name: result.name,
          price: result.marketValue || "$--.--"
        });
        
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: result.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
      } else {
        // Fallback: If AI fails but Local OCR worked, we at least have the name
        if (localName) {
           setScanResult({ name: localName, price: "$SEARCHING..." });
           onCardDetected({
              id: Math.random().toString(36).substr(2, 9),
              name: localName,
              marketValue: "$--.--",
              set: "Unknown Set",
              rarity: "Common",
              type: "Unknown",
              number: "???",
              scanDate: new Date().toLocaleDateString(),
              imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(localName)}`
           });
        } else {
          setError("DEEP_SCAN_MISMATCH");
          setTimeout(() => setError(null), 3000);
        }
      }
    }
    setLoading(false);
    setOcrStatus('idle');
  }, [loading, onCardDetected]);

  return (
    <div className="relative w-full overflow-hidden rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-slate-950 border-4 border-slate-800/50 flex flex-col transition-all duration-700">
      <div className="relative aspect-[4/5] sm:aspect-video bg-slate-900 overflow-hidden">
        
        {/* Exposure Pulse */}
        {flash && <div className="absolute inset-0 z-50 bg-white/60 animate-out fade-out duration-700 pointer-events-none" />}

        {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white px-10 py-3 rounded-2xl text-[10px] font-orbitron font-black shadow-2xl animate-in slide-in-from-top-10 duration-500">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-all duration-1000 ${loading ? 'opacity-30 blur-md' : 'opacity-100 contrast-125 saturate-[1.1]'}`}
            />
            
            {/* Infinite Engine HUD */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-10">
              
              {/* Scan Area Scouter */}
              {!scanResult && !loading && (
                <div className="relative w-72 h-96">
                   {/* Top Left Name Target */}
                   <div className="absolute top-0 left-0 w-32 h-16 border-t-4 border-l-4 border-red-600 rounded-tl-3xl opacity-80">
                      <div className="absolute top-2 left-3 text-[7px] font-orbitron font-black text-red-500 tracking-[0.2em] uppercase">Name_Matrix</div>
                   </div>
                   
                   {/* Main Frame */}
                   <div className="absolute inset-0 border border-white/5 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent"></div>
                   
                   {/* Scan Pulse Line */}
                   <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-scanline"></div>

                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1 h-1 bg-red-600 rounded-full animate-ping"></div>
                   </div>
                </div>
              )}

              {/* Real-time Identification Data */}
              {(scanResult || loading) && (
                <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-20 duration-700">
                  <div className="bg-slate-950/95 backdrop-blur-2xl p-1 rounded-[2.5rem] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,1)]">
                    <div className={`flex items-center justify-between px-8 py-7 rounded-[2.2rem] transition-all duration-500 ${
                        loading ? 'bg-indigo-600/10' : 'bg-red-600/5'
                    }`}>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-indigo-500 animate-pulse' : 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]'}`}></div>
                            <span className="text-[10px] font-orbitron font-black text-slate-400 tracking-[0.4em] uppercase">
                                {loading ? (ocrStatus === 'reading' ? 'LOCAL_OCR_ACTIVE' : 'NEURAL_SYNCING') : 'VAULT_READY'}
                            </span>
                        </div>
                        <h2 className="text-2xl font-orbitron font-bold text-white tracking-tighter truncate max-w-[220px]">
                          {loading ? (ocrStatus === 'reading' ? 'SCANNING...' : 'DECRYPTING...') : scanResult?.name}
                        </h2>
                      </div>
                      
                      {!loading && scanResult && (
                        <div className="pl-8 border-l border-white/10 flex flex-col items-end">
                          <span className="text-[9px] font-black text-slate-500 tracking-[0.3em] uppercase mb-1.5">MARKET</span>
                          <span className="text-3xl font-orbitron font-bold text-green-400 drop-shadow-[0_0_20px_rgba(34,197,94,0.6)]">
                            {scanResult.price}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Diagnostics Overlay */}
            <div className="absolute bottom-8 left-12 flex flex-col gap-1.5 pointer-events-none opacity-60">
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                 <div className="text-[9px] font-orbitron font-black text-white/40 uppercase tracking-[0.5em]">
                    LOCAL_ENGINE: INFINITE
                 </div>
              </div>
              <div className="text-[9px] font-orbitron font-bold text-red-500/60 uppercase tracking-[0.2em] flex items-center gap-2">
                 v1.4.0 - LOCAL_OCR_ENABLED
              </div>
            </div>

            {/* Tactical Input Control */}
            <div className="absolute bottom-16 left-0 right-0 flex justify-center items-center gap-16 px-12">
              <button
                onClick={() => setIsScanning(false)}
                className="w-18 h-18 rounded-3xl bg-slate-950/95 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-3xl hover:scale-110 active:scale-90 shadow-2xl group"
              >
                <svg className="w-9 h-9 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-36 h-36 rounded-full border-[14px] flex items-center justify-center transition-all duration-700 ${
                    loading ? 'border-indigo-600 bg-indigo-600/10 rotate-90 scale-90' : 'border-white bg-red-600 shadow-[0_0_100px_rgba(220,38,38,0.8)]'
                }`}>
                  {loading ? (
                    <div className="flex flex-col items-center gap-1">
                       <svg className="animate-spin h-12 w-12 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </div>
                  ) : (
                    <div className="w-18 h-18 rounded-full bg-white opacity-100 group-hover:scale-90 transition-all shadow-2xl flex items-center justify-center">
                       <div className="w-6 h-6 rounded-full border-[5px] border-slate-950/5 bg-slate-100"></div>
                    </div>
                  )}
                </div>
                {!loading && <div className="absolute -inset-10 rounded-full border-2 border-red-500/10 animate-ping pointer-events-none"></div>}
              </button>
              
              <div className="w-18 h-18 invisible"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-16">
             <div className="relative w-36 h-36 mb-16 flex items-center justify-center">
                <div className="absolute inset-0 border-8 border-red-600/10 rounded-full animate-pulse"></div>
                <div className="absolute inset-8 border-4 border-red-600/30 rounded-full animate-spin duration-[8000ms]"></div>
                <div className="w-20 h-20 bg-red-600 rounded-full shadow-[0_0_60px_rgba(220,38,38,0.8)] flex items-center justify-center transition-transform hover:scale-110 duration-700">
                    <div className="w-6 h-6 bg-white rounded-full"></div>
                </div>
             </div>
             <button onClick={startCamera} className="px-20 py-7 bg-red-600 hover:bg-red-700 text-white font-black rounded-3xl shadow-2xl transition-all uppercase tracking-[0.8em] text-[13px] active:scale-95 border-b-8 border-red-900 group">
               Sync Neural Scanner
             </button>
             <p className="mt-8 text-[9px] font-orbitron font-bold text-slate-600 tracking-[0.4em] uppercase">Infinite Local Processing Online</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
