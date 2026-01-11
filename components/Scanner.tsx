
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally } from '../services/ocrService';
import { PokemonCard } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

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

  // BACKGROUND CONTINUOUS SCANNING LOOP (LOCAL OCR)
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
            }
          } catch (e) {
            console.warn("Local OCR processing frame...");
          }
        }
        setIsProcessingLocal(false);
      }, 800); 
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
      
      // AI Identification removed per user request. Relying on Local OCR + Local DB.
      const name = liveDetectedName || await extractNameLocally(canvas);

      if (name) {
        // Attempt to find metadata in our local Surging Sparks database
        const localMatch = SURGING_SPARKS_DATA.find(c => 
            c.name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(c.name.toLowerCase())
        );

        const result: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          name: localMatch?.name || name,
          marketValue: localMatch?.marketValue || "$--.--",
          set: localMatch?.set || "Local Scan",
          rarity: localMatch?.rarity || "Common",
          type: localMatch?.type || "Unknown",
          number: localMatch?.number || "???",
          scanDate: new Date().toLocaleDateString(),
          imageUrl: localMatch?.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(name)}`
        };

        setScanResult({ name: result.name, price: result.marketValue || "N/A" });
        onCardDetected(result);
        setTimeout(() => setScanResult(null), 2500);
      } else {
        setError("TARGET_NOT_LOCKED");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected, liveDetectedName]);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden flex flex-col transition-all duration-700 cursor-pointer"
      onClick={handleCaptureAndBind}
    >
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-all duration-700 ${loading ? 'opacity-50 blur-xl scale-110' : 'opacity-100'}`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/70 pointer-events-none" />}
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center pointer-events-none p-6">
          <div className="absolute top-[18%] -translate-y-full w-full max-w-sm px-6 transition-transform duration-500">
            <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/10 px-8 py-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center border-t-2 border-white/5">
                <span className="text-xl sm:text-2xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {loading ? "PROCESSING..." : (liveDetectedName || "AWAITING TARGET")}
                </span>
                
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${liveDetectedName || loading ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[8px] font-orbitron font-black tracking-[0.4em] uppercase transition-colors duration-300 ${liveDetectedName || loading ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {loading ? 'Analyzing' : liveDetectedName ? 'OCR_LOCKED' : 'Local Sensor Active'}
                  </span>
                </div>
            </div>
          </div>

          <div className={`absolute bottom-12 transition-opacity duration-700 ${!liveDetectedName && !loading ? 'opacity-30' : 'opacity-0'}`}>
             <span className="text-[10px] font-orbitron font-black text-white tracking-[0.6em] uppercase">Tap to capture locked name</span>
          </div>

          {scanResult && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-md z-40 animate-in fade-in zoom-in duration-300">
                  <div className="bg-slate-950 border border-green-500/40 p-10 rounded-[4rem] shadow-[0_0_100px_rgba(34,197,94,0.3)] flex flex-col items-center gap-6 text-center max-w-xs w-full">
                      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.6)]">
                          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <div>
                        <h2 className="text-3xl font-orbitron font-black text-white uppercase tracking-tighter leading-none">{scanResult.name}</h2>
                        <p className="text-green-400 font-bold text-[10px] tracking-[0.3em] uppercase mt-3 py-1 px-3 bg-green-400/10 rounded-lg inline-block">Vault Synchronized</p>
                      </div>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[32%] left-1/2 -translate-x-1/2 z-[60] bg-red-600/90 backdrop-blur-xl text-white px-8 py-3 rounded-2xl text-[10px] font-orbitron font-black shadow-2xl animate-in slide-in-from-top-10 duration-500 uppercase tracking-widest">
                  {error}
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
