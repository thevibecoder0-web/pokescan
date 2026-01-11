
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
      setError("CAMERA_LINK_FAILED");
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
    setTimeout(() => setFlash(false), 200);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { alpha: false });

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const result = await identifyPokemonCard(imageData);

      if (result && result.name) {
        setScanResult({
          name: result.name,
          price: result.marketValue || "$--.--"
        });
        
        // Auto-persist to Vault
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: result.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
      } else {
        setError("SENSOR_MISMATCH: RE-ALIGNING");
        setTimeout(() => setError(null), 2500);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected]);

  return (
    <div className="relative w-full overflow-hidden rounded-[2.5rem] shadow-2xl bg-black border-2 border-slate-800 flex flex-col transition-all duration-500">
      <div className="relative aspect-[3/4] sm:aspect-video bg-slate-900 overflow-hidden">
        
        {/* Exposure Pulse */}
        {flash && <div className="absolute inset-0 z-50 bg-white/60 animate-out fade-out duration-500 pointer-events-none" />}

        {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-red-600 text-white px-8 py-2.5 rounded-full text-[10px] font-orbitron font-black shadow-[0_0_30px_rgba(220,38,38,0.5)] animate-in slide-in-from-top-4 duration-300">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-all duration-700 ${loading ? 'opacity-30 grayscale blur-[2px]' : 'opacity-95 contrast-110 saturate-[1.2]'}`}
            />
            
            {/* Intelligent HUD Layer */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
              
              {/* Central Identity Result */}
              {(scanResult || loading) && (
                <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-12 duration-500 ease-out">
                  <div className="bg-slate-950/95 backdrop-blur-3xl p-1 rounded-[2rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden">
                    <div className={`flex items-center justify-between px-6 py-5 rounded-[1.8rem] transition-colors duration-500 ${loading ? 'bg-yellow-500/10' : 'bg-red-600/5'}`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'}`}></div>
                            <span className="text-[10px] font-orbitron font-black text-slate-400 tracking-[0.25em] uppercase">
                            {loading ? 'ANALYZING_FLUX' : 'DATA_EXTRACTED'}
                            </span>
                        </div>
                        <h2 className="text-xl font-orbitron font-bold text-white truncate max-w-[190px] tracking-tight">
                          {loading ? 'DECRYPTING...' : scanResult?.name}
                        </h2>
                      </div>
                      
                      {!loading && scanResult && (
                        <div className="text-right flex flex-col items-end">
                          <span className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1">MKT_VAL</span>
                          <span className="text-2xl font-orbitron font-bold text-green-400 drop-shadow-[0_0_12px_rgba(34,197,94,0.5)]">
                            {scanResult.price}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Passive Scanning Geometry */}
              {!scanResult && !loading && (
                <div className="relative w-64 h-80 flex items-center justify-center">
                    <div className="absolute inset-0 border border-white/5 rounded-[2.5rem]"></div>
                    {/* Corner accents */}
                   <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-red-600 rounded-tl-[1.5rem] opacity-40"></div>
                   <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-red-600 rounded-tr-[1.5rem] opacity-40"></div>
                   <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-red-600 rounded-bl-[1.5rem] opacity-40"></div>
                   <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-red-600 rounded-br-[1.5rem] opacity-40"></div>
                   
                   <div className="flex flex-col items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></div>
                      <span className="text-[9px] font-orbitron font-bold text-white/10 tracking-[0.6em] uppercase">Binding Point</span>
                   </div>
                </div>
              )}
            </div>

            {/* Version Meta-Data */}
            <div className="absolute bottom-6 left-10 flex flex-col gap-1 pointer-events-none">
              <div className="text-[9px] font-orbitron font-black text-white/20 uppercase tracking-[0.4em]">
                 CORE_FREQ: HYPER_SYNCED
              </div>
              <div className="text-[9px] font-orbitron font-bold text-red-500/50 uppercase tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse"></span>
                 v1.2.0 - STABLE_RECOGNITION
              </div>
            </div>

            {/* Tactical Control Interface */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-12 px-10">
              <button
                onClick={() => setIsScanning(false)}
                className="w-16 h-16 rounded-2xl bg-slate-950/90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-3xl hover:scale-110 active:scale-95 shadow-2xl group"
              >
                <svg className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-32 h-32 rounded-full border-[10px] flex items-center justify-center transition-all duration-500 ${
                    loading ? 'border-yellow-500/50 bg-yellow-500/5 scale-90' : 'border-white bg-red-600 shadow-[0_0_80px_rgba(220,38,38,0.5)]'
                }`}>
                  {loading ? (
                    <div className="flex flex-col items-center gap-1">
                       <svg className="animate-spin h-10 w-10 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       <span className="text-[8px] font-black text-yellow-500 tracking-[0.2em]">EXTRACTING</span>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white opacity-100 group-hover:scale-90 transition-all shadow-2xl flex items-center justify-center overflow-hidden">
                       <div className="w-5 h-5 rounded-full border-[3px] border-slate-900/20 bg-slate-100"></div>
                       <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent pointer-events-none"></div>
                    </div>
                  )}
                </div>
                {!loading && <div className="absolute -inset-6 rounded-full border-2 border-red-500/10 animate-ping pointer-events-none"></div>}
              </button>
              
              <div className="w-16 h-16 invisible"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12 transition-all duration-1000">
             <div className="relative w-28 h-28 mb-12 flex items-center justify-center">
                <div className="absolute inset-0 border-[6px] border-red-600/10 rounded-full animate-pulse"></div>
                <div className="absolute inset-4 border-[4px] border-red-600/20 rounded-full animate-spin duration-[4000ms]"></div>
                <div className="w-14 h-14 bg-red-600 rounded-full shadow-[0_0_40px_rgba(220,38,38,0.6)] flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                </div>
             </div>
             <button onClick={startCamera} className="px-14 py-5 bg-red-600 hover:bg-red-700 text-white font-black rounded-[1.8rem] shadow-2xl transition-all uppercase tracking-[0.5em] text-[11px] active:scale-95 border-b-4 border-red-900 group">
               <span className="group-hover:tracking-[0.6em] transition-all duration-300">Sync Optical Core</span>
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
