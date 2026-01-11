
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';

interface Point {
  x: number;
  y: number;
}

interface Corners {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
}

interface ScannerProps {
  onCardDetected: (card: PokemonCard) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  
  // Real-time tracking state
  const [corners, setCorners] = useState<Corners>({
    tl: { x: 25, y: 25 },
    tr: { x: 75, y: 25 },
    bl: { x: 25, y: 75 },
    br: { x: 75, y: 75 }
  });

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Unable to access camera. Please ensure permissions are granted.");
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  /**
   * ROBUST CARD DETECTION ALGORITHM
   * 1. Downsample video frame.
   * 2. Calculate pixel gradients (Edge Detection).
   * 3. Find extreme points using Projection (Sum/Diff of coordinates).
   * 4. LERP (Linear Interpolation) for smooth tracking.
   */
  useEffect(() => {
    if (!isScanning) return;

    let animationFrameId: number;
    const processFrame = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = processCanvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Downsample for performance (approx 100-160px width is plenty for feature tracking)
        const width = 120;
        const height = Math.floor((video.videoHeight / video.videoWidth) * width);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Extremal Points based on projections
        // TL: min(x+y), TR: max(x-y), BR: max(x+y), BL: min(x-y)
        let minSum = Infinity, maxSum = -Infinity;
        let minDiff = Infinity, maxDiff = -Infinity;
        
        let pTL = { x: 25, y: 25 }, pTR = { x: 75, y: 25 };
        let pBR = { x: 75, y: 75 }, pBL = { x: 25, y: 75 };
        
        let found = false;
        const threshold = 35; // Gradient magnitude threshold

        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            // Simple Gradient Magnitude (Sobel approximation)
            // L(x,y) = brightness
            const getL = (ox: number, oy: number) => {
              const i = ((y + oy) * width + (x + ox)) * 4;
              return (data[i] + data[i+1] + data[i+2]) / 3;
            };
            
            const dx = getL(1, 0) - getL(-1, 0);
            const dy = getL(0, 1) - getL(0, -1);
            const mag = Math.sqrt(dx*dx + dy*dy);

            if (mag > threshold) {
              const sum = x + y;
              const diff = x - y;
              
              if (sum < minSum) { minSum = sum; pTL = { x, y }; }
              if (sum > maxSum) { maxSum = sum; pBR = { x, y }; }
              if (diff < minDiff) { minDiff = diff; pBL = { x, y }; }
              if (diff > maxDiff) { maxDiff = diff; pTR = { x, y }; }
              found = true;
            }
          }
        }

        if (found) {
          // Normalize to percentages (0-100)
          const targetCorners = {
            tl: { x: (pTL.x / width) * 100, y: (pTL.y / height) * 100 },
            tr: { x: (pTR.x / width) * 100, y: (pTR.y / height) * 100 },
            bl: { x: (pBL.x / width) * 100, y: (pBL.y / height) * 100 },
            br: { x: (pBR.x / width) * 100, y: (pBR.y / height) * 100 }
          };

          // LERP for smooth UI transition (25% step)
          setCorners(prev => ({
            tl: { x: prev.tl.x + (targetCorners.tl.x - prev.tl.x) * 0.25, y: prev.tl.y + (targetCorners.tl.y - prev.tl.y) * 0.25 },
            tr: { x: prev.tr.x + (targetCorners.tr.x - prev.tr.x) * 0.25, y: prev.tr.y + (targetCorners.tr.y - prev.tr.y) * 0.25 },
            bl: { x: prev.bl.x + (targetCorners.bl.x - prev.bl.x) * 0.25, y: prev.bl.y + (targetCorners.bl.y - prev.bl.y) * 0.25 },
            br: { x: prev.br.x + (targetCorners.br.x - prev.br.x) * 0.25, y: prev.br.y + (targetCorners.br.y - prev.br.y) * 0.25 },
          }));
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    processFrame();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isScanning]);

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
    setDetectedName(null);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullResImage = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      const result = await identifyPokemonCard(fullResImage);

      if (result && result.name && result.name.toLowerCase() !== 'unknown') {
        setDetectedName(result.name);
      } else {
        setDetectedName("Detection Failed");
        setTimeout(() => setDetectedName(null), 3000);
      }
    }
    setLoading(false);
  }, [loading]);

  // Dynamic CSS Polygon for perspective distortion
  const clipPath = `polygon(${corners.tl.x}% ${corners.tl.y}%, ${corners.tr.x}% ${corners.tr.y}%, ${corners.br.x}% ${corners.br.y}%, ${corners.bl.x}% ${corners.bl.y}%)`;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl shadow-2xl bg-black border-2 border-slate-800 flex flex-col">
      <div className="relative aspect-[3/4] sm:aspect-video bg-slate-900 overflow-hidden">
        {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600/90 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-xl backdrop-blur-sm">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover opacity-70 grayscale contrast-125"
            />
            
            {/* Perspective HUD Layer */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Dynamic perspective frame */}
              <div 
                className={`absolute inset-0 border-2 transition-colors duration-300 ${loading ? 'border-yellow-400' : 'border-red-500/40'}`}
                style={{ clipPath, backgroundColor: loading ? 'rgba(250,204,21,0.1)' : 'rgba(239, 68, 68, 0.05)' }}
              >
                {/* HUD Elements at Corners */}
                <div style={{ position: 'absolute', top: `${corners.tl.y}%`, left: `${corners.tl.x}%`, transform: 'translate(-50%, -50%)' }} className="w-6 h-6 border-t-2 border-l-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                <div style={{ position: 'absolute', top: `${corners.tr.y}%`, left: `${corners.tr.x}%`, transform: 'translate(50%, -50%)' }} className="w-6 h-6 border-t-2 border-r-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                <div style={{ position: 'absolute', top: `${corners.bl.y}%`, left: `${corners.bl.x}%`, transform: 'translate(-50%, 50%)' }} className="w-6 h-6 border-b-2 border-l-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                <div style={{ position: 'absolute', top: `${corners.br.y}%`, left: `${corners.br.x}%`, transform: 'translate(50%, 50%)' }} className="w-6 h-6 border-b-2 border-r-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
              </div>

              {/* Top-Left Dynamic Label */}
              <div 
                className="absolute bg-slate-950/95 backdrop-blur-2xl px-5 py-2 rounded-xl border border-white/10 whitespace-nowrap shadow-2xl flex items-center gap-3 transition-all duration-75"
                style={{ 
                  top: `calc(${corners.tl.y}% - 50px)`, 
                  left: `${corners.tl.x}%`,
                  opacity: (corners.tl.y > 5 && corners.tl.x > 5) ? 1 : 0,
                  transform: 'scale(0.9)'
                }}
              >
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full ${loading ? 'bg-yellow-500 animate-ping' : 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]'}`}></div>
                  {loading && <div className="absolute inset-0 w-3 h-3 rounded-full bg-yellow-500"></div>}
                </div>
                <span className="text-[12px] font-orbitron font-black uppercase tracking-[0.15em] text-white">
                  {loading ? 'CALIBRATING...' : (detectedName || 'SCANNING ASSET')}
                </span>
              </div>

              {/* Version Identifier */}
              <div className="absolute bottom-6 left-6 flex flex-col gap-1">
                <div className="text-[10px] font-orbitron font-black text-white/40 uppercase tracking-[0.3em]">
                   SYSTEM_ID: POKE-SCAN_7
                </div>
                <div className="text-[9px] font-orbitron font-bold text-red-500/60 uppercase tracking-widest">
                   v1.0.7 - ENHANCED_TRACKING
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-12 px-4">
              <button
                onClick={() => setIsScanning(false)}
                className="w-14 h-14 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-xl hover:scale-110 active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-28 h-28 rounded-full border-8 flex items-center justify-center transition-all duration-300 ${
                    loading ? 'border-yellow-500 bg-yellow-500/10' : 'border-white bg-red-600 shadow-[0_0_60px_rgba(220,38,38,0.5)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-12 w-12 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white group-hover:scale-95 transition-transform shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]"></div>
                  )}
                </div>
                {!loading && <div className="absolute -inset-2 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none"></div>}
              </button>
              
              <div className="w-14 h-14"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-12 text-center bg-slate-950">
             <div className="w-20 h-20 mb-8 border-4 border-red-600 rounded-full flex items-center justify-center opacity-20 animate-pulse">
                <div className="w-12 h-12 bg-red-600 rounded-full"></div>
             </div>
             <button onClick={startCamera} className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-2xl transition-all uppercase tracking-[0.3em] text-xs active:scale-95 border border-red-400/30">
               Sync Optical Sensor
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={processCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
