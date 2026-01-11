
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
  const [lastDetected, setLastDetected] = useState<string>("");
  const [ocrStatus, setOcrStatus] = useState<string>("Initializing Local Scanner...");
  const processingRef = useRef(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        setStream(ms);
        if (videoRef.current) videoRef.current.srcObject = ms;
        
        await initOCRWorker();
        setOcrStatus("Local OCR Engine Ready");
      } catch (e) {
        console.error("Camera access denied");
        setOcrStatus("Camera Access Required");
      }
    };
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const runLocalDetection = useCallback(async () => {
    if (processingRef.current || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    processingRef.current = true;
    setOcrStatus("Processing Local Frame...");

    try {
      // 1. Run local OCR (Free, no limits)
      const ocrResult = await extractCardTextLocally(canvas);
      
      if (ocrResult && (ocrResult.name || ocrResult.number)) {
        setOcrStatus(`Detected: ${ocrResult.name} ${ocrResult.number}`);
        
        // 2. Match to Local Database (Free, no limits)
        const localMatch = matchToLocalDatabase(ocrResult.name, ocrResult.number);
        
        if (localMatch && localMatch.name !== lastDetected) {
          setLastDetected(localMatch.name);
          onCardDetected({
            ...localMatch,
            scanDate: new Date().toLocaleDateString(),
          });
          setOcrStatus(`Asset Linked: ${localMatch.name}`);
        }
      } else {
        setOcrStatus("Scanning for Card Data...");
      }
    } catch (e) {
      console.error("Local scan error", e);
    } finally {
      processingRef.current = false;
    }
  }, [onCardDetected, lastDetected]);

  useEffect(() => {
    // Run local OCR every 2 seconds - completely free and unlimited
    const interval = setInterval(runLocalDetection, 2500);
    return () => clearInterval(interval);
  }, [runLocalDetection]);

  return (
    <div className="relative w-full h-full bg-black rounded-[3rem] overflow-hidden border-4 border-slate-800 shadow-2xl">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-90" />
      <canvas ref={canvasRef} className="hidden" width="800" height="600" />
      
      {/* Target Reticle */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-80 border-2 border-dashed border-cyan-400/40 rounded-3xl relative">
          <div className="absolute inset-0 border-2 border-cyan-400 rounded-3xl opacity-20 animate-pulse" />
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-xl" />
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400/50 animate-scanline-sweep" />
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full px-6 flex flex-col items-center gap-4">
        <div className="bg-slate-950/90 backdrop-blur-xl px-8 py-4 rounded-3xl border border-cyan-500/30 flex items-center gap-4 shadow-2xl max-w-sm w-full">
          <div className={`w-3 h-3 rounded-full ${processingRef.current ? 'bg-amber-400 animate-ping' : 'bg-green-400 animate-pulse'}`} />
          <div className="flex-1 overflow-hidden">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Local Processing Engine</p>
            <p className="text-xs font-orbitron font-bold text-white tracking-tighter truncate">
              {ocrStatus}
            </p>
          </div>
        </div>
        
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-black/40 px-4 py-1 rounded-full backdrop-blur-sm">
          Unlimited Offline Scanning Active
        </p>
      </div>
    </div>
  );
};

export default Scanner;
