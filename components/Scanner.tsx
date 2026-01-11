
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractCardTextLocally, initOCRWorker } from '../services/ocrService';
import { matchToLocalDatabase } from '../services/localDatabaseService';
import { PokemonCard } from '../types';

interface ScannerProps {
  onCardDetected: (card: Partial<PokemonCard>) => void;
  onScanError: (error: any) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, onScanError, isProcessing, setIsProcessing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [lastDetectedId, setLastDetectedId] = useState<string>("");
  const [ocrStatus, setOcrStatus] = useState<string>("SYSTEM_IDLE");
  const [isLocked, setIsLocked] = useState(false);
  
  const processingRef = useRef(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', 
            width: { ideal: 1280 }, 
            height: { ideal: 720 },
            frameRate: { ideal: 60 }
          }
        });
        setStream(ms);
        if (videoRef.current) videoRef.current.srcObject = ms;
        
        await initOCRWorker();
        setOcrStatus("NEURAL_CORE_ONLINE");
      } catch (e) {
        setOcrStatus("HARDWARE_FAILURE");
        onScanError(e);
      }
    };
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const runLocalDetection = useCallback(async () => {
    if (processingRef.current || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // PERFORMANCE OPTIMIZATION: 
    // 1. Small canvas for OCR (Tesseract is faster with less pixels)
    // 2. High-contrast filter to help OCR engine
    ctx.filter = 'contrast(180%) brightness(120%) grayscale(100%)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    processingRef.current = true;
    setIsProcessing(true);

    try {
      const ocrResult = await extractCardTextLocally(canvas);
      
      if (ocrResult && (ocrResult.name || ocrResult.number)) {
        const localMatch = matchToLocalDatabase(ocrResult.name, ocrResult.number);
        
        if (localMatch) {
          const matchId = `${localMatch.name}-${localMatch.number}`;
          if (matchId !== lastDetectedId) {
            setLastDetectedId(matchId);
            setIsLocked(true);
            setOcrStatus(`MATCH_LOCKED: ${localMatch.name}`);
            onCardDetected(localMatch);
            
            // Short reset for visual feedback
            setTimeout(() => setIsLocked(false), 2000);
          }
        } else {
            setOcrStatus(`SIGNAL_WEAK: ${ocrResult.name || '???'} ${ocrResult.number || '???'}`);
        }
      } else {
        setOcrStatus("SIGNAL_SEARCHING...");
      }
    } catch (e) {
      console.error("Local scan cycle error", e);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [onCardDetected, lastDetectedId, setIsProcessing]);

  useEffect(() => {
    // 1s interval is the sweet spot for browser Tesseract performance
    const interval = setInterval(runLocalDetection, 1200);
    return () => clearInterval(interval);
  }, [runLocalDetection]);

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-[3rem] overflow-hidden border-4 border-slate-800 shadow-2xl transition-all duration-300">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* OCR Buffer Canvas (Hidden) - Smaller for speed */}
      <canvas ref={canvasRef} className="hidden" width="480" height="640" />
      
      {/* UI Overlays */}
      <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ${isLocked ? 'bg-cyan-500/10' : ''}`}>
        <div className="flex items-center justify-center h-full">
          <div className={`w-72 h-96 border-2 border-dashed rounded-[2.5rem] transition-all duration-500 flex flex-col items-center justify-center ${isLocked ? 'border-cyan-400 scale-105 shadow-[0_0_50px_rgba(34,211,238,0.3)]' : 'border-white/20'}`}>
            
            {/* Corner Markers */}
            <div className={`absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/10'}`} />
            <div className={`absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/10'}`} />
            <div className={`absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/10'}`} />
            <div className={`absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/10'}`} />

            {/* Scan Line */}
            {!isLocked && (
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent absolute top-0 animate-scanline-sweep opacity-40 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
            )}

            {isLocked && (
                <div className="bg-cyan-500/90 text-slate-950 font-orbitron font-black text-xs px-6 py-2 rounded-full uppercase tracking-widest animate-pulse">
                    MATCH_LOCKED
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Status Footer */}
      <div className="absolute bottom-8 left-0 right-0 px-8 flex justify-center">
        <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 px-8 py-5 rounded-[2rem] flex items-center gap-6 shadow-2xl max-w-md w-full">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Neural Stream</span>
            <span className={`text-xs font-orbitron font-bold transition-colors ${isLocked ? 'text-cyan-400' : 'text-white'}`}>
              {ocrStatus}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${processingRef.current ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`} />
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
