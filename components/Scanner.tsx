
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { manualCardLookup } from '../services/geminiService';
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
  const [lockConfidence, setLockConfidence] = useState(0);

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

  /**
   * CONTINUOUS NEURAL LOCK LOOP
   * Runs locally on the device to find and stabilize the Pokemon name.
   */
  useEffect(() => {
    let animationFrame: number;
    const processFrame = async () => {
      if (!isScanning || loading || !videoRef.current || !canvasRef.current || isProcessingLocal) {
        animationFrame = requestAnimationFrame(processFrame);
        return;
      }

      setIsProcessingLocal(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });

      if (context && video.videoWidth > 0) {
        // Match aspect for local processing
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
          const name = await extractNameLocally(canvas);
          if (name) {
            setLiveDetectedName(name);
            setLockConfidence(prev => Math.min(prev + 34, 100)); // ~3 frames to lock
          } else {
            setLockConfidence(prev => Math.max(prev - 5, 0)); // Slow decay
          }
        } catch (e) {
          console.warn("Frame Drop");
        }
      }
      setIsProcessingLocal(false);
      animationFrame = requestAnimationFrame(processFrame);
    };

    if (isScanning) {
      animationFrame = requestAnimationFrame(processFrame);
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [isScanning, loading, isProcessingLocal]);

  const handleCaptureAndBind = useCallback(async () => {
    if (!liveDetectedName || loading || lockConfidence < 50) return;

    setLoading(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    try {
      // Use the locked OCR name to fetch official data/price via the simple text lookup
      const result = await manualCardLookup(liveDetectedName);

      if (result && result.name) {
        setScanResult({ name: result.name, price: result.marketValue || "$--.--" });
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: result.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
        setLockConfidence(0);
        setLiveDetectedName(null);
        setTimeout(() => setScanResult(null), 2500);
      } else {
        // Fallback if price lookup fails
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          name: liveDetectedName,
          marketValue: "$--.--",
          set: "Manual Lock",
          rarity: "Standard",
          type: "Asset",
          number: "---",
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(liveDetectedName)}`
        });
        setScanResult({ name: liveDetectedName, price: "N/A" });
        setLockConfidence(0);
        setLiveDetectedName(null);
        setTimeout(() => setScanResult(null), 2500);
      }
    } catch (e) {
      setError("NEURAL_SYNC_FAILED");
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  }, [loading, onCardDetected, liveDetectedName, lockConfidence]);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden flex flex-col cursor-pointer"
      onClick={handleCaptureAndBind}
    >
      {/* Camera Feed */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-opacity duration-700 ${loading ? 'opacity-40' : 'opacity-100'}`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/80" />}
      </div>

      {/* HUD Overlay */}
      <div className="relative z-10 w-full h-full flex flex-col items-center pointer-events-none p-6">
          
          {/* Neural Lock Status */}
          <div className="absolute top-[18%] -translate-y-full w-full max-w-sm px-6">
            <div className="bg-slate-950/90 backdrop-blur-3xl border border-white/10 px-8 py-6 rounded-[2.5rem] shadow-2xl text-center relative overflow-hidden">
                {/* Confidence Bar */}
                <div 
                    className="absolute bottom-0 left-0 h-1.5 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)] transition-all duration-200" 
                    style={{ width: `${lockConfidence}%` }} 
                />

                <span className="text-2xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {loading ? "FETCHING ASSET DATA" : (liveDetectedName || "LOCATING TARGET")}
                </span>
                
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${lockConfidence >= 100 ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[8px] font-orbitron font-black tracking-[0.4em] uppercase ${lockConfidence >= 100 ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {loading ? 'Decrypting' : lockConfidence >= 100 ? 'NEURAL LOCK CONFIRMED' : 'SYNCING MATRIX...'}
                  </span>
                </div>
            </div>
          </div>

          {/* Prompt */}
          <div className={`absolute bottom-12 transition-opacity duration-700 ${lockConfidence >= 100 ? 'opacity-100' : 'opacity-0'}`}>
             <div className="bg-cyan-400 text-slate-950 px-6 py-2 rounded-full font-orbitron font-black text-[10px] tracking-[0.4em] uppercase animate-pulse">
                Tap to Save Record
             </div>
          </div>

          {/* Result Overlay */}
          {scanResult && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-40 animate-in fade-in duration-300">
                  <div className="bg-slate-950 border border-green-500/40 p-12 rounded-[4rem] flex flex-col items-center gap-6 text-center max-w-xs w-full shadow-[0_0_80px_rgba(34,197,94,0.2)]">
                      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <h2 className="text-3xl font-orbitron font-black text-white uppercase tracking-tighter">{scanResult.name}</h2>
                      <p className="text-green-400 font-bold text-xs tracking-widest">{scanResult.price}</p>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[32%] z-[60] bg-red-600 text-white px-8 py-3 rounded-2xl text-[10px] font-orbitron font-black uppercase tracking-widest">
                  {error}
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
