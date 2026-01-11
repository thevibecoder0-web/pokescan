
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
  const [liveDetectedName, setLiveDetectedName] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [flash, setFlash] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [signalStrength, setSignalStrength] = useState(0);

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
    if (isScanning) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isScanning]);

  // BACKGROUND CONTINUOUS SCANNING LOOP
  useEffect(() => {
    let interval: number;
    if (isScanning && !loading) {
      interval = window.setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || isProcessingLocal || loading) return;

        setIsProcessingLocal(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });

        if (context && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          try {
            const name = await extractNameLocally(canvas);
            if (name) {
              setLiveDetectedName(name);
              setSignalStrength(prev => Math.min(prev + 25, 100)); // Build confidence
            } else {
              setSignalStrength(prev => Math.max(prev - 10, 0)); // Decay confidence
            }
          } catch (e) {
            console.warn("OCR Tick Offline");
          }
        }
        setIsProcessingLocal(false);
      }, 1000); 
    }

    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal]);

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { alpha: false });

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullImageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      
      const result = await identifyPokemonCard(fullImageBase64, false);

      if (result && result.name) {
        setScanResult({ name: result.name, price: result.marketValue || "$--.--" });
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: result.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
        setTimeout(() => setScanResult(null), 3500);
      } else if (liveDetectedName) {
        // Safe Fallback
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          name: liveDetectedName,
          marketValue: "$--.--",
          set: "Local Scan",
          rarity: "Common",
          type: "Unknown",
          number: "???",
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(liveDetectedName)}`
        });
        setScanResult({ name: liveDetectedName, price: "N/A" });
        setTimeout(() => setScanResult(null), 3500);
      } else {
        setError("NEURAL_LINK_ERROR");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected, liveDetectedName]);

  return (
    <div className="relative w-full overflow-hidden rounded-[4rem] shadow-[0_0_120px_rgba(0,0,0,0.8)] bg-slate-950 border-8 border-slate-900 flex flex-col transition-all duration-700">
      <div className="relative aspect-[4/5] sm:aspect-video bg-black overflow-hidden group">
        
        {/* Exposure Flash */}
        {flash && <div className="absolute inset-0 z-50 bg-white/80 animate-pulse pointer-events-none" />}

        {error && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[60] bg-red-600/95 backdrop-blur-xl text-white px-12 py-4 rounded-3xl text-xs font-orbitron font-black shadow-[0_0_50px_rgba(220,38,38,0.6)] animate-in slide-in-from-top-20 duration-500">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-all duration-1000 ${loading ? 'opacity-40 blur-2xl scale-125' : 'opacity-100 contrast-[1.15] saturate-[1.2]'}`}
            />
            
            {/* TACTICAL HUD OVERLAY */}
            <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
                {/* Top Diagnostics Bar */}
                <div className="flex justify-between items-start">
                    <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 px-6 py-2.5 rounded-2xl flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="text-[7px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">Scanner_Model</span>
                            <span className="text-[10px] font-orbitron font-bold text-white tracking-widest">PX-7NEURAL</span>
                        </div>
                        <div className="h-6 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[7px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">Optical_Link</span>
                            <span className="text-[10px] font-orbitron font-bold text-green-400">ENCRYPTED</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-3">
                            <span className="text-[8px] font-orbitron font-black text-white/40 tracking-[0.3em] uppercase">Signal_Lock</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className={`w-1.5 h-3 rounded-full transition-colors duration-500 ${signalStrength >= (i * 25) ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-white/10'}`} />
                                ))}
                            </div>
                        </div>
                        <div className="text-[7px] font-mono text-cyan-400/50">LAT: 0.003s</div>
                    </div>
                </div>

                {/* Central Targeting Reticle */}
                {!scanResult && !loading && (
                    <div className="self-center flex flex-col items-center">
                        <div className="relative w-80 h-96 transition-transform duration-700 group-hover:scale-105">
                            {/* Corner Markers */}
                            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-cyan-400/80 rounded-tl-3xl shadow-[-5px_-5px_20px_rgba(34,211,238,0.2)]"></div>
                            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-cyan-400/80 rounded-tr-3xl shadow-[5px_-5px_20px_rgba(34,211,238,0.2)]"></div>
                            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-cyan-400/80 rounded-bl-3xl shadow-[-5px_5px_20px_rgba(34,211,238,0.2)]"></div>
                            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-cyan-400/80 rounded-br-3xl shadow-[5px_5px_20px_rgba(34,211,238,0.2)]"></div>
                            
                            {/* Scanning Pulse Line */}
                            <div className="absolute inset-0 border border-white/5 rounded-[3rem] bg-gradient-to-b from-cyan-400/5 via-transparent to-cyan-400/5"></div>
                            <div className="absolute top-0 left-4 right-4 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent shadow-[0_0_25px_rgba(34,211,238,1)] animate-scanline"></div>
                            
                            {/* Target Metadata (Floating) */}
                            <div className="absolute -left-20 top-1/4 bg-slate-950/80 backdrop-blur-md border border-white/5 p-3 rounded-xl rotate-[-90deg]">
                                <span className="text-[6px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">Focus_Dist</span>
                                <div className="text-[8px] font-bold text-white">AUTO_SYNC</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Binding Animation */}
                {scanResult && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-40 animate-in fade-in zoom-in duration-500">
                        <div className="bg-slate-950/90 border-2 border-green-400/50 p-10 rounded-[4rem] shadow-[0_0_150px_rgba(34,197,94,0.4)] flex flex-col items-center gap-6">
                            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.6)]">
                                <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <div className="text-center">
                                <h2 className="text-4xl font-orbitron font-black text-white uppercase tracking-tighter mb-2">{scanResult.name}</h2>
                                <div className="bg-green-500/10 border border-green-500/20 px-6 py-2 rounded-2xl">
                                    <span className="text-green-400 font-bold tracking-[0.4em] text-[10px] uppercase">Market_Vault_Binding: {scanResult.price}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* BOTTOM CONTROL PANEL */}
                <div className="flex flex-col items-center gap-10">
                    
                    {/* Real-time OCR Readout */}
                    <div className={`flex flex-col items-center gap-4 transition-all duration-700 ${liveDetectedName ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-4'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isProcessingLocal ? 'bg-cyan-400 animate-pulse shadow-[0_0_15px_rgba(34,211,238,1)]' : 'bg-slate-700'}`} />
                            <span className="text-[9px] font-orbitron font-black text-cyan-400 tracking-[0.5em] uppercase">
                                {isProcessingLocal ? 'SYNCHRONIZING_READOUT' : 'AWAITING_INPUT'}
                            </span>
                        </div>
                        <div className="bg-slate-950/90 backdrop-blur-3xl border-2 border-white/10 px-14 py-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[320px] text-center transform hover:scale-105 transition-transform duration-500">
                            <span className="text-4xl font-orbitron font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                {liveDetectedName || "ALIGN TOP BAR"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-16 pb-4">
                        <button
                            onClick={() => setIsScanning(false)}
                            className="w-20 h-20 rounded-[2.5rem] bg-slate-900/90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-500/40 transition-all backdrop-blur-3xl hover:scale-110 active:scale-90 shadow-2xl group"
                        >
                            <svg className="w-10 h-10 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>

                        <button onClick={handleCaptureAndBind} disabled={loading} className="group relative">
                            <div className={`w-36 h-36 rounded-full border-[14px] flex items-center justify-center transition-all duration-700 ${
                                loading ? 'border-cyan-600 bg-cyan-600/10 rotate-180 scale-90 shadow-[0_0_80px_rgba(8,145,178,0.5)]' : 'border-white bg-red-600 shadow-[0_0_80px_rgba(220,38,38,0.8)] hover:bg-red-500 hover:shadow-[0_0_100px_rgba(220,38,38,1)]'
                            }`}>
                                {loading ? (
                                    <div className="flex flex-col items-center gap-1">
                                        <svg className="animate-spin h-14 w-14 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-white opacity-100 group-hover:scale-110 transition-all shadow-2xl flex items-center justify-center border-8 border-slate-950/10">
                                        <div className="w-8 h-8 rounded-full border-[6px] border-red-600/20 bg-red-600/10"></div>
                                    </div>
                                )}
                            </div>
                            {!loading && liveDetectedName && <div className="absolute -inset-10 rounded-full border-4 border-cyan-400/40 animate-ping pointer-events-none"></div>}
                        </button>
                        
                        <div className="w-20 h-20 invisible"></div>
                    </div>
                </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-24">
             <div className="relative w-48 h-48 mb-20 flex items-center justify-center">
                <div className="absolute inset-0 border-[12px] border-cyan-400/5 rounded-full animate-pulse"></div>
                <div className="absolute inset-10 border-[6px] border-cyan-400/10 rounded-full animate-spin duration-[10000ms]"></div>
                <div className="w-28 h-28 bg-red-600 rounded-full shadow-[0_0_100px_rgba(220,38,38,0.8)] flex items-center justify-center transition-transform hover:scale-110 duration-700 cursor-pointer" onClick={startCamera}>
                    <div className="w-10 h-10 bg-white rounded-full"></div>
                </div>
             </div>
             <button onClick={startCamera} className="px-24 py-8 bg-red-600 hover:bg-red-700 text-white font-black rounded-[2.5rem] shadow-[0_20px_60px_rgba(220,38,38,0.4)] transition-all uppercase tracking-[0.8em] text-[16px] active:scale-95 border-b-8 border-red-900 group">
                INIT_NEURAL_LINK
             </button>
             <div className="mt-12 flex items-center gap-6 opacity-30">
                <div className="h-px w-16 bg-white/20" />
                <span className="text-[10px] font-orbitron font-black text-white tracking-[0.8em] uppercase italic">Pokedex OS 4.0</span>
                <div className="h-px w-16 bg-white/20" />
             </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
