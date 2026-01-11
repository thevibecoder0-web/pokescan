
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { PokemonCard } from '../types';

// Global OpenCV helper
declare var cv: any;

interface Point {
  x: number;
  y: number;
}

interface CardCorners {
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
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedData, setDetectedData] = useState<OCRResult | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  
  // Logical corners (snapping points)
  const [targetCorners, setTargetCorners] = useState<CardCorners | null>(null);
  // Visual corners (smoothed points)
  const [visualCorners, setVisualCorners] = useState<CardCorners | null>(null);
  const [viewBox, setViewBox] = useState({ w: 0, h: 0 });
  
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const lastVerifiedKey = useRef<string>("");
  const lastFoundTime = useRef<number>(0);
  const animationFrameRef = useRef<number>(null);

  useEffect(() => {
    const checkCV = setInterval(() => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        setCvReady(true);
        clearInterval(checkCV);
      }
    }, 500);
    return () => clearInterval(checkCV);
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track as any).getCapabilities?.() || {};
        if (capabilities.torch) {
          setTorchSupported(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
           setViewBox({ w: videoRef.current!.videoWidth, h: videoRef.current!.videoHeight });
        };
      }
    } catch (err) {
      setError("CAMERA_LINK_FAILURE");
    }
  };

  const toggleTorch = async () => {
    if (!stream || !torchSupported) return;
    const track = stream.getVideoTracks()[0];
    try {
      const newTorchState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: newTorchState }]
      } as any);
      setIsTorchOn(newTorchState);
    } catch (e) {
      console.error("Failed to toggle torch", e);
    }
  };

  useEffect(() => {
    if (isScanning) startCamera();
    else if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
      setIsTorchOn(false);
    }
  }, [isScanning]);

  /**
   * INTERPOLATION ENGINE: 60FPS Fluid Transition
   */
  useEffect(() => {
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
    
    const animate = () => {
      if (targetCorners) {
        setVisualCorners(prev => {
          if (!prev) return targetCorners;
          const factor = 0.25; 
          return {
            tl: { x: lerp(prev.tl.x, targetCorners.tl.x, factor), y: lerp(prev.tl.y, targetCorners.tl.y, factor) },
            tr: { x: lerp(prev.tr.x, targetCorners.tr.x, factor), y: lerp(prev.tr.y, targetCorners.tr.y, factor) },
            bl: { x: lerp(prev.bl.x, targetCorners.bl.x, factor), y: lerp(prev.bl.y, targetCorners.bl.y, factor) },
            br: { x: lerp(prev.br.x, targetCorners.br.x, factor), y: lerp(prev.br.y, targetCorners.br.y, factor) }
          };
        });
      } else {
        setVisualCorners(null);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [targetCorners]);

  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return; 
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let src = cv.imread(canvas);
      let gray = new cv.Mat();
      let thresh = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.medianBlur(gray, gray, 5); 
      
      cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
      
      let M = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, M);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let foundCorners: CardCorners | null = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        if (area > (canvas.width * canvas.height * 0.06)) {
          let approx = new cv.Mat();
          let peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) {
              pts.push({ 
                x: approx.data32S[j * 2] * 2, 
                y: approx.data32S[j * 2 + 1] * 2 
              });
            }

            const sortedBySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
            const sortedByDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x));

            const potentialCorners = {
              tl: sortedBySum[0],
              br: sortedBySum[3],
              tr: sortedByDiff[0],
              bl: sortedByDiff[3]
            };

            const wTop = Math.hypot(potentialCorners.tr.x - potentialCorners.tl.x, potentialCorners.tr.y - potentialCorners.tl.y);
            const hLeft = Math.hypot(potentialCorners.bl.x - potentialCorners.tl.x, potentialCorners.bl.y - potentialCorners.tl.y);
            const ratio = wTop / hLeft;

            if (ratio > 0.55 && ratio < 0.95) {
              if (area > maxArea) {
                maxArea = area;
                foundCorners = potentialCorners;
              }
            }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (foundCorners) {
        setTargetCorners(foundCorners);
        lastFoundTime.current = Date.now();
      } else {
        if (Date.now() - lastFoundTime.current > 800) {
           setTargetCorners(null);
        }
      }

      src.delete(); gray.delete(); thresh.delete(); M.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Failure");
    }
  }, [cvReady]);

  const instantVault = async (data: OCRResult) => {
    if (!data.name || !data.number) return;
    const verificationKey = `${data.name}-${data.number}`.toLowerCase();
    
    if (lastVerifiedKey.current === verificationKey) return;
    lastVerifiedKey.current = verificationKey;

    setTargetCorners(null);
    setVisualCorners(null);

    const finalCard: PokemonCard = {
      id: Math.random().toString(36).substring(2, 11),
      name: data.name,
      number: data.number,
      set: "Neural Scan",
      rarity: "Detected",
      type: "Unknown",
      marketValue: "$--.--",
      imageUrl: `https://placehold.co/400x560/1e293b/white?text=${data.name}+${data.number}`,
      scanDate: new Date().toLocaleDateString()
    };

    setScanResult({ name: finalCard.name, price: "--" });
    onCardDetected(finalCard);
    
    setTimeout(() => {
      setScanResult(null);
      setDetectedData(null);
    }, 1500);
  };

  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !scanResult) {
      interval = window.setInterval(async () => {
        detectCardWithCV();

        if (targetCorners && !isProcessing) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d', { alpha: false });
          
          if (cCtx) {
            const minX = Math.min(targetCorners.tl.x, targetCorners.tr.x, targetCorners.bl.x, targetCorners.br.x);
            const maxX = Math.max(targetCorners.tl.x, targetCorners.tr.x, targetCorners.bl.x, targetCorners.br.x);
            const minY = Math.min(targetCorners.tl.y, targetCorners.tr.y, targetCorners.bl.y, targetCorners.br.y);
            const maxY = Math.max(targetCorners.tl.y, targetCorners.tr.y, targetCorners.bl.y, targetCorners.br.y);

            const padding = 20; 
            const cropX = Math.max(0, minX - padding);
            const cropY = Math.max(0, minY - padding);
            const cropW = Math.min(video.videoWidth - cropX, (maxX - minX) + (padding * 2));
            const cropH = Math.min(video.videoHeight - cropY, (maxY - minY) + (padding * 2));

            cardCanvas.width = cropW;
            cardCanvas.height = cropH;
            cCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            const result = await extractNameLocally(cardCanvas);
            if (result) {
              setDetectedData(result);
              if (result.name && result.number) {
                instantVault(result);
              }
            }
          }
          setIsProcessing(false);
        }
      }, 62); 
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, targetCorners, isProcessing, scanResult]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {visualCorners && viewBox.w > 0 && !scanResult && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden animate-in fade-in duration-300">
          <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
             <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`}
                className={`fill-transparent stroke-[4px] transition-all duration-300 ${detectedData?.name ? 'stroke-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,1)]' : 'stroke-white/40'}`}
             />
             {[visualCorners.tl, visualCorners.tr, visualCorners.bl, visualCorners.br].map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="8" className="fill-cyan-400 stroke-black stroke-2" />
             ))}
          </svg>

          <div 
            style={{ left: `${(visualCorners.tl.x / viewBox.w) * 100}%`, top: `${(visualCorners.tl.y / viewBox.h) * 100}%` }}
            className="absolute -translate-y-28 translate-x-4 flex flex-col gap-2 scale-90 sm:scale-100"
          >
             <div className="flex gap-2">
                <span className={`px-4 py-2 text-[12px] font-orbitron font-black uppercase rounded-lg shadow-2xl backdrop-blur-md ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-900/90 text-slate-500 border border-white/10'}`}>
                  {detectedData?.name || 'NEURAL_LOCKING...'}
                </span>
             </div>
             {detectedData?.number && (
               <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 rounded-lg inline-block self-start">
                  <span className="text-[10px] font-orbitron font-bold text-white uppercase tracking-widest">#{detectedData.number}</span>
               </div>
             )}
          </div>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        {scanResult && (
           <div className="bg-slate-900/95 backdrop-blur-3xl border-4 border-cyan-500/50 p-16 rounded-[4rem] shadow-[0_0_150px_rgba(34,211,238,0.3)] animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
              <div className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="text-4xl font-orbitron font-black text-white mb-2 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="bg-cyan-500/20 text-cyan-400 py-2 px-8 rounded-full border border-cyan-500/30 inline-block">
                  <span className="text-[10px] font-orbitron font-black uppercase tracking-[0.4em]">VAULT_SECURED</span>
              </div>
           </div>
        )}
      </div>

      {/* Torch Toggle Control */}
      {torchSupported && (
        <div className="absolute bottom-10 right-10 flex flex-col gap-4">
          <button 
              onClick={toggleTorch}
              className={`pointer-events-auto backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 group ${isTorchOn ? 'bg-amber-500/90 text-white' : 'bg-slate-900/90 text-slate-400'}`}
              title={isTorchOn ? "Flash: ON" : "Flash: OFF"}
          >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isTorchOn ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11.414 13.414 13 15l-1.586-1.586zM13 10V3L4 14h7v7l9-11h-7z" />
                  )}
                  {!isTorchOn && (
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2.5" />
                  )}
              </svg>
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
