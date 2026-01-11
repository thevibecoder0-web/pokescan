
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';

declare const cv: any; // Global OpenCV.js instance

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
  const [cvReady, setCvReady] = useState(false);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  
  // Real-time tracking state
  const [corners, setCorners] = useState<Corners>({
    tl: { x: 25, y: 25 },
    tr: { x: 75, y: 25 },
    bl: { x: 25, y: 75 },
    br: { x: 75, y: 75 }
  });

  // Check for OpenCV.js availability
  useEffect(() => {
    const checkCV = () => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        setCvReady(true);
      } else {
        setTimeout(checkCV, 500);
      }
    };
    checkCV();
  }, []);

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
   * ADVANCED OPENCV CARD DETECTION
   * 1. Grayscale & Gaussian Blur
   * 2. Canny Edge Detection
   * 3. Contour Extraction
   * 4. Quadrilateral Approximation (approxPolyDP)
   * 5. Sort Corners by Perspective
   */
  useEffect(() => {
    if (!isScanning || !cvReady) return;

    let animationFrameId: number;
    let gray: any, blurred: any, edges: any, contours: any, hierarchy: any;

    const processFrame = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = processCanvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Downsample to 320px width for smooth real-time processing
        const width = 320;
        const height = Math.floor((video.videoHeight / video.videoWidth) * width);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);

        try {
          const src = cv.imread(canvas);
          if (!gray) gray = new cv.Mat();
          if (!blurred) blurred = new cv.Mat();
          if (!edges) edges = new cv.Mat();
          
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
          cv.Canny(blurred, edges, 50, 150);
          
          if (!contours) contours = new cv.MatVector();
          if (!hierarchy) hierarchy = new cv.Mat();
          
          cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          let maxArea = 0;
          let bestContour: any = null;

          for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            if (area > (width * height * 0.15)) { // Must be at least 15% of frame
              const peri = cv.arcLength(cnt, true);
              const approx = new cv.Mat();
              cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
              
              if (approx.rows === 4 && area > maxArea) {
                maxArea = area;
                if (bestContour) bestContour.delete();
                bestContour = approx;
              } else {
                approx.delete();
              }
            }
          }

          if (bestContour) {
            const points: Point[] = [];
            for (let i = 0; i < 4; i++) {
              points.push({
                x: bestContour.data32S[i * 2],
                y: bestContour.data32S[i * 2 + 1]
              });
            }

            // Sort points: top-left, top-right, bottom-right, bottom-left
            points.sort((a, b) => a.y - b.y);
            const top = points.slice(0, 2).sort((a, b) => a.x - b.x);
            const bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
            
            const targetCorners = {
              tl: { x: (top[0].x / width) * 100, y: (top[0].y / height) * 100 },
              tr: { x: (top[1].x / width) * 100, y: (top[1].y / height) * 100 },
              br: { x: (bottom[1].x / width) * 100, y: (bottom[1].y / height) * 100 },
              bl: { x: (bottom[0].x / width) * 100, y: (bottom[0].y / height) * 100 }
            };

            setCorners(prev => ({
              tl: { x: prev.tl.x + (targetCorners.tl.x - prev.tl.x) * 0.3, y: prev.tl.y + (targetCorners.tl.y - prev.tl.y) * 0.3 },
              tr: { x: prev.tr.x + (targetCorners.tr.x - prev.tr.x) * 0.3, y: prev.tr.y + (targetCorners.tr.y - prev.tr.y) * 0.3 },
              bl: { x: prev.bl.x + (targetCorners.bl.x - prev.bl.x) * 0.3, y: prev.bl.y + (targetCorners.bl.y - prev.bl.y) * 0.3 },
              br: { x: prev.br.x + (targetCorners.br.x - prev.br.x) * 0.3, y: prev.br.y + (targetCorners.br.y - prev.br.y) * 0.3 },
            }));
            
            bestContour.delete();
          }

          src.delete();
        } catch (err) {
          console.warn("OpenCV Processing Error:", err);
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    processFrame();
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (edges) edges.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    };
  }, [isScanning, cvReady]);

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
        setDetectedName("Extraction Failed");
        setTimeout(() => setDetectedName(null), 3000);
      }
    }
    setLoading(false);
  }, [loading]);

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
              className={`w-full h-full object-cover transition-opacity duration-1000 ${cvReady ? 'opacity-70 contrast-125' : 'opacity-20'}`}
            />
            
            {/* Perspective HUD Layer */}
            <div className="absolute inset-0 pointer-events-none">
              {!cvReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin"></div>
                      <span className="font-orbitron text-[10px] text-slate-500 tracking-[0.3em]">INITIALIZING CV_ENGINE</span>
                   </div>
                </div>
              )}

              {/* Dynamic perspective frame */}
              <div 
                className={`absolute inset-0 border-2 transition-colors duration-300 ${loading ? 'border-yellow-400' : 'border-red-500/40'}`}
                style={{ clipPath, backgroundColor: loading ? 'rgba(250,204,21,0.1)' : 'rgba(239, 68, 68, 0.05)' }}
              >
                {/* HUD Elements at Corners */}
                <div style={{ position: 'absolute', top: `${corners.tl.y}%`, left: `${corners.tl.x}%`, transform: 'translate(-50%, -50%)' }} className="w-6 h-6 border-t-2 border-l-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]"></div>
                <div style={{ position: 'absolute', top: `${corners.tr.y}%`, left: `${corners.tr.x}%`, transform: 'translate(50%, -50%)' }} className="w-6 h-6 border-t-2 border-r-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]"></div>
                <div style={{ position: 'absolute', top: `${corners.bl.y}%`, left: `${corners.bl.x}%`, transform: 'translate(-50%, 50%)' }} className="w-6 h-6 border-b-2 border-l-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]"></div>
                <div style={{ position: 'absolute', top: `${corners.br.y}%`, left: `${corners.br.x}%`, transform: 'translate(50%, 50%)' }} className="w-6 h-6 border-b-2 border-r-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]"></div>
              </div>

              {/* Top-Left Dynamic Label */}
              <div 
                className="absolute bg-slate-950/95 backdrop-blur-2xl px-5 py-2 rounded-xl border border-white/10 whitespace-nowrap shadow-2xl flex items-center gap-3 transition-all duration-75"
                style={{ 
                  top: `calc(${corners.tl.y}% - 50px)`, 
                  left: `${corners.tl.x}%`,
                  opacity: (cvReady && corners.tl.y > 5 && corners.tl.x > 5) ? 1 : 0,
                  transform: 'scale(0.9)'
                }}
              >
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full ${loading ? 'bg-yellow-500 animate-ping' : 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]'}`}></div>
                  {loading && <div className="absolute inset-0 w-3 h-3 rounded-full bg-yellow-500"></div>}
                </div>
                <span className="text-[12px] font-orbitron font-black uppercase tracking-[0.15em] text-white">
                  {loading ? 'ANALYZING...' : (detectedName || 'CARD DETECTED')}
                </span>
              </div>

              {/* Version Identifier */}
              <div className="absolute bottom-6 left-6 flex flex-col gap-1">
                <div className="text-[10px] font-orbitron font-black text-white/40 uppercase tracking-[0.3em]">
                   SYSTEM_ID: OPENCV_X8
                </div>
                <div className="text-[9px] font-orbitron font-bold text-red-500/60 uppercase tracking-widest">
                   v1.0.8 - COMPUTER_VISION_ENABLED
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

              <button onClick={captureFrame} disabled={loading || !cvReady} className="group relative">
                <div className={`w-28 h-28 rounded-full border-8 flex items-center justify-center transition-all duration-300 ${
                    loading ? 'border-yellow-500 bg-yellow-500/10' : 'border-white bg-red-600 shadow-[0_0_60px_rgba(220,38,38,0.5)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-12 w-12 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white group-hover:scale-95 transition-transform shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]"></div>
                  )}
                </div>
                {!loading && cvReady && <div className="absolute -inset-2 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none"></div>}
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
               Initialize Optical HUD
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
