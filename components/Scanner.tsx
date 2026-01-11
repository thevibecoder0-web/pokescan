
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
    tl: { x: 20, y: 20 },
    tr: { x: 80, y: 20 },
    bl: { x: 20, y: 80 },
    br: { x: 80, y: 80 }
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

  // Algorithm to find the card in the frame
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

        // Downsample for performance
        const width = 160;
        const height = (video.videoHeight / video.videoWidth) * width;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        let minX = width, maxX = 0, minY = height, maxY = 0;
        let found = false;

        // Simple edge/contrast detection to find the "brightest" rectangular-ish object (the card)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;
            
            // Threshold for typical card highlights/borders in contrast to background
            if (brightness > 140) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              found = true;
            }
          }
        }

        if (found && (maxX - minX) > width * 0.2) {
          // Normalize to percentages and add some smoothing/padding
          const targetCorners = {
            tl: { x: (minX / width) * 100, y: (minY / height) * 100 },
            tr: { x: (maxX / width) * 100, y: (minY / height) * 100 },
            bl: { x: (minX / width) * 100, y: (maxY / height) * 100 },
            br: { x: (maxX / width) * 100, y: (maxY / height) * 100 }
          };

          // Basic jitter reduction (lerp)
          setCorners(prev => ({
            tl: { x: prev.tl.x + (targetCorners.tl.x - prev.tl.x) * 0.2, y: prev.tl.y + (targetCorners.tl.y - prev.tl.y) * 0.2 },
            tr: { x: prev.tr.x + (targetCorners.tr.x - prev.tr.x) * 0.2, y: prev.tr.y + (targetCorners.tr.y - prev.tr.y) * 0.2 },
            bl: { x: prev.bl.x + (targetCorners.bl.x - prev.bl.x) * 0.2, y: prev.bl.y + (targetCorners.bl.y - prev.bl.y) * 0.2 },
            br: { x: prev.br.x + (targetCorners.br.x - prev.br.x) * 0.2, y: prev.br.y + (targetCorners.br.y - prev.br.y) * 0.2 },
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
        setDetectedName("Text Not Found");
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
              className="w-full h-full object-cover opacity-80"
            />
            
            {/* Dynamic Card Border Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Perspective Frame */}
              <div 
                className={`absolute inset-0 border-[3px] transition-colors duration-300 ${loading ? 'border-yellow-400' : 'border-white/40'}`}
                style={{ clipPath, backgroundColor: loading ? 'rgba(250,204,21,0.1)' : 'transparent' }}
              >
                {/* Visual corners for high-tech look */}
                <div style={{ position: 'absolute', top: `${corners.tl.y}%`, left: `${corners.tl.x}%`, transform: 'translate(-50%, -50%)' }} className="w-4 h-4 border-t-4 border-l-4 border-red-600"></div>
                <div style={{ position: 'absolute', top: `${corners.tr.y}%`, left: `${corners.tr.x}%`, transform: 'translate(50%, -50%)' }} className="w-4 h-4 border-t-4 border-r-4 border-red-600"></div>
                <div style={{ position: 'absolute', top: `${corners.bl.y}%`, left: `${corners.bl.x}%`, transform: 'translate(-50%, 50%)' }} className="w-4 h-4 border-b-4 border-l-4 border-red-600"></div>
                <div style={{ position: 'absolute', top: `${corners.br.y}%`, left: `${corners.br.x}%`, transform: 'translate(50%, 50%)' }} className="w-4 h-4 border-b-4 border-r-4 border-red-600"></div>
              </div>

              {/* Top-Left Label following the card's TL corner */}
              <div 
                className="absolute bg-slate-950/90 backdrop-blur-xl px-4 py-1.5 rounded-lg border border-white/20 whitespace-nowrap shadow-2xl flex items-center gap-2 transition-all duration-100"
                style={{ 
                  top: `calc(${corners.tl.y}% - 45px)`, 
                  left: `${corners.tl.x}%`,
                  opacity: (corners.tl.y > 5 && corners.tl.x > 5) ? 1 : 0
                }}
              >
                <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-red-600'}`}></div>
                <span className="text-[10px] font-orbitron font-bold uppercase tracking-[0.1em] text-white">
                  {loading ? 'Reading Top-Left...' : (detectedName || 'Position Card')}
                </span>
              </div>

              {/* Bottom-Left Version Info (Fixed to screen bottom-left as requested) */}
              <div className="absolute bottom-4 left-4 text-[9px] font-orbitron font-bold text-slate-500 uppercase tracking-widest px-1">
                 SV8 v1.0.6 - DEV BUILD
              </div>
            </div>

            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-8 px-4">
              <button
                onClick={() => setIsScanning(false)}
                className="w-16 h-16 rounded-full bg-slate-950/90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-xl hover:scale-110 active:scale-90"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-24 h-24 rounded-full border-[6px] flex items-center justify-center transition-all ${
                    loading ? 'border-yellow-500 bg-yellow-500/20' : 'border-white bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.6)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-10 w-10 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-white opacity-90 group-hover:scale-90 transition-transform shadow-inner"></div>
                  )}
                </div>
              </button>
              
              <div className="w-16 h-16"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-12 text-center">
             <button onClick={startCamera} className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-full shadow-2xl transition-all uppercase tracking-widest text-sm active:scale-95">
               Initialize Camera
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
