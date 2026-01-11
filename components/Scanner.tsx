
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';

interface ScannerProps {
  onCardDetected: (card: Partial<PokemonCard>) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isProcessing, setIsProcessing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const lastCaptureTime = useRef<number>(0);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        setStream(ms);
        if (videoRef.current) videoRef.current.srcObject = ms;
      } catch (e) {
        console.error("Camera access denied");
      }
    };
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (isProcessing || !videoRef.current || !canvasRef.current) return;
    
    // Rate limit auto-capture to ensure quality frames
    const now = Date.now();
    if (now - lastCaptureTime.current < 2000) return; 

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Snapshot
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    
    setIsProcessing(true);
    lastCaptureTime.current = now;

    try {
      const result = await identifyPokemonCard(base64);
      if (result && result.found) {
        onCardDetected({
          name: result.name,
          set: result.set,
          number: result.number,
          rarity: result.rarity,
          marketPrice: result.marketPrice,
          imageUrl: result.imageUrl, // Standardized property name
          type: result.type,
          hp: result.hp,
          marketValue: result.marketValue,
          sourceUrl: result.sourceUrl
        });
      }
    } catch (e) {
      console.error("Auto-scan failed", e);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, onCardDetected, setIsProcessing]);

  useEffect(() => {
    const interval = setInterval(captureAndAnalyze, 1000);
    return () => clearInterval(interval);
  }, [captureAndAnalyze]);

  return (
    <div className="relative w-full h-full bg-black rounded-[3rem] overflow-hidden border-4 border-slate-800 shadow-2xl">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-90" />
      <canvas ref={canvasRef} className="hidden" width="1024" height="768" />
      
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

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="bg-slate-900/80 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
          <span className="font-orbitron text-[10px] font-bold text-white tracking-[0.3em] uppercase">
            {isProcessing ? 'Analyzing Neural Data' : 'Neural Scan Active'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
