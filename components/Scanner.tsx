
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
          // Process at a lower resolution for speed
          canvas.width = 640;
          canvas.height = 480;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          try {
            const name = await extractNameLocally(canvas.toDataURL('image/jpeg', 0.7));
            if (name && name.length > 2) {
              setLiveDetectedName(name);
            }
          } catch (e) {
            console.warn("Background OCR Tick Failed");
          }
        }
        setIsProcessingLocal(false);
      }, 1500); // Pulse every 1.5 seconds
    }

    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal]);

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { alpha: false });

    if (context) {
      // High-res capture for Gemini
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullImageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      
      // Use the live name if we have it to steer the AI, or just scan fresh
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
        
        // Clear result after 3 seconds to reset UI
        setTimeout(() => setScanResult(null), 3000);
      } else if (liveDetectedName) {
        // Fallback: If AI fails but we have a local name, we still bind it
        const finalName = liveDetectedName;
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          name: finalName,
          marketValue: "$--.--",
          set: "Manual Entry",
          rarity: "Common",
          type: "Unknown",
          number: "???",
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(finalName)}`
        });
        setScanResult({ name: finalName, price: "N/A" });
        setTimeout(() => setScanResult(null), 3000);
      } else {
        setError("DEEP_SCAN_MISMATCH");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected, liveDetectedName]);

  return (
    <div className="relative w-full overflow-hidden rounded-[3rem] shadow-[0_0_80px_rgba(0,0,0,0.6)] bg-slate-950 border-4 border-slate-800/80 flex flex-col transition-all duration-700">
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
              className={`w-full h-full object-cover transition-all duration-1000 ${loading ? 'opacity-30 blur-xl scale-110' : 'opacity-100 contrast-125 saturate-[1.1]'}`}
            />
            
            {/* Infinite Engine HUD */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-10">
              
              {/* Scan Area Scouter */}
              {!scanResult && !loading && (
                <div className="relative w-72 h-96">
                   <div className="absolute top-0 left-0 w-32 h-16 border-t-4 border-l-4 border-red-600 rounded-tl-3xl opacity-80">
                      <div className="absolute top-2 left-3 text-[7px] font-orbitron font-black text-red-500 tracking-[0.2em] uppercase">Visual_Target</div>
                   </div>
                   <div className="absolute inset-0 border border-white/5 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent"></div>
                   <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500/30 shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-scanline"></div>

                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1 h-1 bg-red-600 rounded-full animate-ping"></div>
                   </div>
                </div>
              )}

              {/* Final Identification Success */}
              {scanResult && !loading && (
                <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                  <div className="bg-green-500/90 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-green-400/50 shadow-[0_0_100px_rgba(34,197,94,0.4)] flex flex-col items-center gap-2">
                     <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                     <h2 className="text-2xl font-orbitron font-black text-white uppercase tracking-tighter">{scanResult.name}</h2>
                     <p className="text-white/80 font-bold tracking-widest text-xs uppercase">Bound to Vault • {scanResult.price}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Diagnostics Overlay */}
            <div className="absolute top-8 right-12 flex items-center gap-2 pointer-events-none opacity-60">
              <div className="text-[9px] font-orbitron font-black text-white/40 uppercase tracking-[0.5em]">
                 AUTONOMIC_SCAN: ACTIVE
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${isProcessingLocal ? 'bg-indigo-500' : 'bg-green-500'}`}></div>
            </div>

            {/* Tactical Control Interface - Repositioned Display under the button */}
            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-6 px-12">
              
              <div className="flex items-center gap-12">
                <button
                    onClick={() => setIsScanning(false)}
                    className="w-16 h-16 rounded-3xl bg-slate-950/95 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-3xl hover:scale-110 active:scale-90 shadow-2xl group"
                >
                    <svg className="w-8 h-8 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>

                <button onClick={handleCaptureAndBind} disabled={loading} className="group relative">
                    <div className={`w-32 h-32 rounded-full border-[12px] flex items-center justify-center transition-all duration-700 ${
                        loading ? 'border-indigo-600 bg-indigo-600/10 rotate-90 scale-90' : 'border-white bg-red-600 shadow-[0_0_80px_rgba(220,38,38,0.8)] hover:bg-red-500'
                    }`}>
                    {loading ? (
                        <div className="flex flex-col items-center gap-1">
                        <svg className="animate-spin h-10 w-10 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-white opacity-100 group-hover:scale-110 transition-all shadow-2xl flex items-center justify-center">
                           <div className="w-5 h-5 rounded-full border-[4px] border-slate-950/5 bg-slate-100"></div>
                        </div>
                    )}
                    </div>
                    {liveDetectedName && !loading && <div className="absolute -inset-8 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none"></div>}
                </button>
                
                <div className="w-16 h-16 invisible"></div>
              </div>

              {/* LIVE DETECTION HUD (Under Button) */}
              <div className={`flex flex-col items-center transition-all duration-500 ${liveDetectedName ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-0'}`}>
                  <div className="flex items-center gap-3 mb-1">
                      <div className={`w-2 h-2 rounded-full ${isProcessingLocal ? 'bg-red-500 animate-pulse' : 'bg-red-500/40'}`}></div>
                      <span className="text-[9px] font-orbitron font-black text-red-500 tracking-[0.4em] uppercase">
                          {isProcessingLocal ? 'Analyzing_Matrix' : 'Feed_Idle'}
                      </span>
                  </div>
                  <div className="bg-slate-950/80 backdrop-blur-2xl border border-white/10 px-10 py-3 rounded-2xl shadow-2xl">
                      <span className="text-xl font-orbitron font-bold text-white tracking-tighter">
                          {liveDetectedName || "Align Asset to Begin"}
                      </span>
                  </div>
                  <div className="text-[8px] font-orbitron font-bold text-white/30 tracking-[0.6em] uppercase mt-3">
                     Bind Detected Asset
                  </div>
              </div>
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
             <p className="mt-8 text-[9px] font-orbitron font-bold text-slate-600 tracking-[0.4em] uppercase">Infinite Autonomic Recognition</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
