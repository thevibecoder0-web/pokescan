
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyCard } from '../services/geminiService';
import { PokemonCard } from '../types';

declare var cv: any;

interface ScannerProps {
  onCardDetected: (card: Partial<PokemonCard>) => void;
  onNotification: (msg: string) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, onNotification }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cvReady, setCvReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastScanTime = useRef(0);
  const scanTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const checkCV = setInterval(() => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        setCvReady(true);
        clearInterval(checkCV);
      }
    }, 100);
    return () => clearInterval(checkCV);
  }, []);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        onNotification("Camera Access Denied");
      }
    };
    startCamera();
  }, []);

  const processFrame = useCallback(async () => {
    if (!cvReady || isProcessing || !videoRef.current || !canvasRef.current) return;
    
    // Limit scan frequency for performance
    const now = Date.now();
    if (now - lastScanTime.current < 800) return; 

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Detect card shape and crop
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // In a real elite app, we'd use OpenCV here to find the rect and warp it.
    // To keep it under 1.5s total loop, we trigger Gemini on a stable high-res capture.
    
    setIsProcessing(true);
    lastScanTime.current = now;

    try {
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const result = await identifyCard(base64);
      
      if (result && result.found) {
        onNotification(`Captured: ${result.name}`);
        onCardDetected({
          name: result.name,
          set: result.set,
          number: result.number,
          rarity: result.rarity,
          marketPrice: result.marketPrice,
          currency: result.currency,
          imageUrl: canvas.toDataURL('image/jpeg', 0.5)
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  }, [cvReady, isProcessing, onCardDetected, onNotification]);

  useEffect(() => {
    const loop = () => {
      processFrame();
      scanTimeoutRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (scanTimeoutRef.current) cancelAnimationFrame(scanTimeoutRef.current);
    };
  }, [processFrame]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-3xl border-4 border-slate-800">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" width="800" height="600" />
      
      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="w-64 h-96 border-2 border-dashed border-cyan-400/50 rounded-2xl relative">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-xl" />
          
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400 animate-scanline-sweep opacity-50" />
        </div>
        
        <div className="mt-8 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
          <span className="font-orbitron text-xs text-cyan-400 tracking-widest uppercase">
            {isProcessing ? "Analyzing Neural Data..." : "Align Card for Auto-Capture"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Scanner;
