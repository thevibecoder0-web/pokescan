
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
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
      setError("CAMERA_ACCESS_DENIED");
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
    setScanResult(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      const result = await identifyPokemonCard(imageData);

      if (result && result.name !== 'Unknown Asset') {
        setScanResult({
          name: result.name,
          price: result.marketValue || "$--.--"
        });
        
        // Auto-add to collection if valid
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
      } else {
        setError("IDENT_FAILED: Retrying...");
        setTimeout(() => setError(null), 2000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected]);

  return (
    <div className="relative w-full overflow-hidden rounded-[2.5rem] shadow-2xl bg-black border-2 border-slate-800 flex flex-col">
      <div className="relative aspect-[3/4] sm:aspect-video bg-slate-900 overflow-hidden">
        
        {/* Flash Effect */}
        {flash && <div className="absolute inset-0 z-50 bg-white/40 animate-out fade-out duration-300 pointer-events-none" />}

        {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-red-600 text-white px-6 py-2 rounded-full text-[10px] font-orbitron font-black shadow-xl animate-bounce">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-700 ${loading ? 'opacity-40 blur-sm' : 'opacity-90 contrast-110'}`}
            />
            
            {/* Visual HUD Layer */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              
              {/* Central Scan Result UI */}
              {(scanResult || loading) && (
                <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-8 duration-500">
                  <div className="bg-slate-950/90 backdrop-blur-3xl p-1 rounded-3xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden">
                    <div className={`flex items-center justify-between px-6 py-4 rounded-[1.4rem] ${loading ? 'bg-yellow-500/10' : 'bg-white/5'}`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-orbitron font-black text-red-500 tracking-[0.2em] uppercase">
                          {loading ? 'CALIBRATING CORE...' : 'IDENTITY_VERIFIED'}
                        </span>
                        <h2 className="text-xl font-orbitron font-bold text-white truncate max-w-[180px]">
                          {loading ? 'SEARCHING...' : scanResult?.name}
                        </h2>
                      </div>
                      
                      {!loading && scanResult && (
                        <div className="text-right flex flex-col items-end">
                          <span className="text-[9px] font-black text-slate-500 tracking-widest uppercase mb-1">Market Val</span>
                          <span className="text-2xl font-orbitron font-bold text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]">
                            {scanResult.price}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Aiming Reticle (Visible when idle) */}
              {!scanResult && !loading && (
                <div className="relative w-64 h-80 border-2 border-white/5 rounded-[2rem] flex items-center justify-center">
                   <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-red-600 rounded-tl-xl"></div>
                   <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-red-600 rounded-tr-xl"></div>
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-red-600 rounded-bl-xl"></div>
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-red-600 rounded-br-xl"></div>
                   <span className="text-[10px] font-orbitron font-bold text-white/20 tracking-[0.5em] uppercase">Ready to Bind</span>
                </div>
              )}
            </div>

            {/* Version Identifier Overlay */}
            <div className="absolute bottom-6 left-8 flex flex-col gap-1">
              <div className="text-[10px] font-orbitron font-black text-white/30 uppercase tracking-[0.4em]">
                 NET_STATE: SYNCHRONIZED
              </div>
              <div className="text-[9px] font-orbitron font-bold text-red-500/60 uppercase tracking-widest">
                 v1.1.0 - CORE_ENGINE_REWRITE
              </div>
            </div>

            {/* Controls Bar */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-10 px-8">
              <button
                onClick={() => setIsScanning(false)}
                className="w-16 h-16 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-xl hover:scale-110 active:scale-90 shadow-2xl"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-32 h-32 rounded-full border-[10px] flex items-center justify-center transition-all duration-500 ${
                    loading ? 'border-yellow-500 bg-yellow-500/10' : 'border-white bg-red-600 shadow-[0_0_80px_rgba(220,38,38,0.6)]'
                }`}>
                  {loading ? (
                    <div className="flex flex-col items-center">
                       <svg className="animate-spin h-10 w-10 text-yellow-500 mb-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       <span className="text-[8px] font-black text-yellow-500 tracking-tighter">BINDING</span>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white opacity-95 group-hover:scale-90 transition-transform shadow-inner flex items-center justify-center">
                       <div className="w-4 h-4 rounded-full border-2 border-slate-900"></div>
                    </div>
                  )}
                </div>
                {!loading && <div className="absolute -inset-4 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none"></div>}
              </button>
              
              <div className="w-16 h-16"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12">
             <div className="w-24 h-24 mb-10 border-[6px] border-red-600/20 rounded-full flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 bg-red-600 rounded-full shadow-[0_0_30px_rgba(220,38,38,0.5)]"></div>
             </div>
             <button onClick={startCamera} className="px-12 py-5 bg-red-600 hover:bg-red-700 text-white font-black rounded-[1.5rem] shadow-2xl transition-all uppercase tracking-[0.4em] text-xs active:scale-95 border-b-4 border-red-800">
               Sync Optical Sensor
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
