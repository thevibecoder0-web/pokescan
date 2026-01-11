
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
  const [ocrStatus, setOcrStatus] = useState<string>("CALIBRATING...");
  const [isLocked, setIsLocked] = useState(false);
  const [detectionHistory, setDetectionHistory] = useState<string[]>([]);
  
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
        setOcrStatus("READY_FOR_ACQUISITION");
      } catch (e) {
        setOcrStatus("SENSOR_OFFLINE");
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
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    // ADAPTIVE PRE-PROCESSING:
    // Resize to a small, manageable resolution for ultra-fast Tesseract processing
    // High contrast + Grayscale makes text "pop" for the engine
    ctx.filter = 'contrast(200%) brightness(110%) grayscale(100%)';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    processingRef.current = true;
    setIsProcessing(true);

    try {
      const ocrResult = await extractCardTextLocally(canvas);
      
      if (ocrResult && (ocrResult.name || ocrResult.number)) {
        const localMatch = matchToLocalDatabase(ocrResult.name, ocrResult.number);
        
        if (localMatch) {
          const matchId = `${localMatch.name}-${localMatch.number}`;
          
          // Debounce logic: requires the same card to be seen multiple times or a high-conf match
          setDetectionHistory(prev => {
              const newHistory = [...prev, matchId].slice(-3);
              const frequency = newHistory.filter(id => id === matchId).length;
              
              if (frequency >= 2 && matchId !== lastDetectedId) {
                setLastDetectedId(matchId);
                setIsLocked(true);
                setOcrStatus(`TARGET_LOCKED: ${localMatch.name}`);
                onCardDetected(localMatch);
                setTimeout(() => setIsLocked(false), 2500);
                return [];
              }
              return newHistory;
          });
          
          if (!isLocked) setOcrStatus(`RECOGNIZING: ${localMatch.name}`);
        } else {
            setOcrStatus(`ANALYZING: ${ocrResult.name || '???'} ${ocrResult.number || '???'}`);
        }
      } else {
        setOcrStatus("SCANNING_INPUT_STREAM...");
      }
    } catch (e) {
      console.error("Neural Cycle Exception:", e);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [onCardDetected, lastDetectedId, isLocked, setIsProcessing]);

  useEffect(() => {
    // Ultra-aggressive 800ms polling for maximum speed without locking the UI thread
    const interval = setInterval(runLocalDetection, 800);
    return () => clearInterval(interval);
  }, [runLocalDetection]);

  return (
    <div className={`relative w-full h-full bg-slate-950 rounded-[3rem] overflow-hidden border-4 transition-all duration-300 ${isLocked ? 'border-cyan-500 shadow-[0_0_60px_rgba(34,211,238,0.2)]' : 'border-slate-800'}`}>
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-70 contrast-125" />
      
      {/* High-Performance Hidden Buffer */}
      <canvas ref={canvasRef} className="hidden" width="400" height="560" />
      
      {/* Augmented Reality HUD */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="flex items-center justify-center h-full">
          <div className={`w-64 h-80 border-2 rounded-[2.5rem] transition-all duration-300 relative ${isLocked ? 'border-cyan-400 scale-105' : 'border-white/10'}`}>
            
            {/* HUD Bracket UI */}
            <div className={`absolute -top-2 -left-2 w-16 h-16 border-t-4 border-l-4 rounded-tl-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/20'}`} />
            <div className={`absolute -top-2 -right-2 w-16 h-16 border-t-4 border-r-4 rounded-tr-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/20'}`} />
            <div className={`absolute -bottom-2 -left-2 w-16 h-16 border-b-4 border-l-4 rounded-bl-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/20'}`} />
            <div className={`absolute -bottom-2 -right-2 w-16 h-16 border-b-4 border-r-4 rounded-br-3xl transition-colors ${isLocked ? 'border-cyan-400' : 'border-white/20'}`} />

            {/* Dynamic Scanning Line */}
            <div className={`absolute left-0 right-0 h-1 bg-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-opacity duration-300 ${isLocked ? 'opacity-0' : 'animate-scanline-sweep'}`} />

            {/* Lock-on Icon */}
            {isLocked && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-cyan-500/20 w-32 h-32 rounded-full flex items-center justify-center animate-ping">
                        <div className="bg-cyan-400 w-4 h-4 rounded-full" />
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Data */}
      <div className="absolute bottom-8 left-0 right-0 px-8">
        <div className="max-w-md mx-auto bg-slate-900/90 backdrop-blur-3xl border border-white/10 p-5 rounded-[2.5rem] shadow-2xl flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">Neural Link Status</span>
            <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isLocked ? 'bg-cyan-400 animate-pulse' : 'bg-green-500'}`} />
                <span className={`text-[10px] font-orbitron font-black uppercase tracking-tight ${isLocked ? 'text-cyan-400' : 'text-white'}`}>
                  {ocrStatus}
                </span>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1">
             <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">Frame Rate</span>
             <span className="text-[10px] font-orbitron font-bold text-slate-400 uppercase">60 FPS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
