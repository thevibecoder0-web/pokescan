
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { manualCardLookup } from '../services/geminiService';
import { PokemonCard } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

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
  const [isVerifying, setIsVerifying] = useState(false);
  const [detectedData, setDetectedData] = useState<OCRResult | null>(null);
  const [cvReady, setCvReady] = useState(false);
  
  // Perspective & Lock State
  const [corners, setCorners] = useState<CardCorners | null>(null);
  const [viewBox, setViewBox] = useState({ w: 0, h: 0 });
  const [identificationStartTime, setIdentificationStartTime] = useState<number | null>(null);
  const [lockProgress, setLockProgress] = useState(100);
  
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const lastSeenTimeoutRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const lastVerifiedKey = useRef<string>("");

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

  useEffect(() => {
    if (isScanning) startCamera();
    else if (stream) stream.getTracks().forEach(t => t.stop());
  }, [isScanning]);

  const handleReset = useCallback(() => {
    lastVerifiedKey.current = "";
    setScanResult(null);
    setIsVerifying(false);
    setDetectedData(null);
    setCorners(null);
    setIdentificationStartTime(null);
    setLockProgress(100);
    setIsProcessing(false);
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  /**
   * LOCK EXPIRY LOGIC
   * If we've been trying to identify the current corner snap for > 5s,
   * we release the lock and find a new one.
   */
  useEffect(() => {
    if (identificationStartTime && corners && !scanResult && !isVerifying) {
      const timer = setInterval(() => {
        const elapsed = Date.now() - identificationStartTime;
        const remaining = Math.max(0, 100 - (elapsed / 5000) * 100);
        setLockProgress(remaining);

        if (elapsed > 5000) {
          console.log("Identification Timeout: Re-acquiring perspective lock...");
          setCorners(null);
          setIdentificationStartTime(null);
          setDetectedData(null);
          setLockProgress(100);
        }
      }, 100);
      return () => clearInterval(timer);
    }
  }, [identificationStartTime, corners, scanResult, isVerifying]);

  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current || corners) return; // Don't search if already locked
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let src = cv.imread(canvas);
      let dst = new cv.Mat();
      let gray = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(7, 7), 0);
      cv.Canny(gray, dst, 40, 120);
      
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.dilate(dst, dst, kernel);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let foundCorners: CardCorners | null = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        if (area > (canvas.width * canvas.height * 0.1)) {
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

            const widthTop = Math.hypot(potentialCorners.tr.x - potentialCorners.tl.x, potentialCorners.tr.y - potentialCorners.tl.y);
            const heightLeft = Math.hypot(potentialCorners.bl.x - potentialCorners.tl.x, potentialCorners.bl.y - potentialCorners.tl.y);
            const ratio = widthTop / heightLeft;

            if (ratio > 0.60 && ratio < 0.85) {
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
        setCorners(foundCorners);
        setIdentificationStartTime(Date.now());
      }

      src.delete(); dst.delete(); gray.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Lock Error");
    }
  }, [cvReady, corners]);

  const verifyAndVault = async (data: OCRResult) => {
    if (isVerifying || !data.name || !data.number) return;
    const verificationKey = `${data.name}-${data.number}`.toLowerCase();
    if (lastVerifiedKey.current === verificationKey) return;
    
    setIsVerifying(true);
    const { name, number } = data;
    
    let match = SURGING_SPARKS_DATA.find(c => 
      c.name.toLowerCase() === name.toLowerCase() && 
      c.number.includes(number)
    );

    try {
      if (!match) {
        const aiResponse = await manualCardLookup(`${name} pokemon card #${number} tcg market price`);
        if (aiResponse && aiResponse.name && aiResponse.set && aiResponse.set !== "Unknown Set") {
          match = aiResponse as any;
        }
      }

      if (match) {
        const finalCard: PokemonCard = {
          id: Math.random().toString(36).substring(7),
          name: match.name,
          number: match.number,
          set: match.set,
          rarity: match.rarity || 'Verified Asset',
          type: match.type || 'Unknown',
          marketValue: match.marketValue || '$--.--',
          imageUrl: match.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${match.name}+${match.number}`,
          scanDate: new Date().toLocaleDateString()
        };

        lastVerifiedKey.current = verificationKey;
        setScanResult({ name: finalCard.name, price: finalCard.marketValue || '$??' });
        onCardDetected(finalCard);
        
        setTimeout(() => {
          setScanResult(null);
          setIsVerifying(false);
          setCorners(null);
          setIdentificationStartTime(null);
        }, 3500);
      } else {
        setIsVerifying(false);
      }
    } catch (e) {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !isVerifying && !scanResult) {
      interval = window.setInterval(async () => {
        detectCardWithCV();

        if (corners && !isProcessing && !isVerifying) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d');
          
          if (cCtx) {
            // High-Res extraction from the locked perspective
            const minX = Math.min(corners.tl.x, corners.tr.x, corners.bl.x, corners.br.x);
            const maxX = Math.max(corners.tl.x, corners.tr.x, corners.bl.x, corners.br.x);
            const minY = Math.min(corners.tl.y, corners.tr.y, corners.bl.y, corners.br.y);
            const maxY = Math.max(corners.tl.y, corners.tr.y, corners.bl.y, corners.br.y);

            const padding = 20;
            const cropX = Math.max(0, minX - padding);
            const cropY = Math.max(0, minY - padding);
            const cropW = Math.min(video.videoWidth - cropX, (maxX - minX) + (padding * 2));
            const cropH = Math.min(video.videoHeight - cropY, (maxY - minY) + (padding * 2));

            cardCanvas.width = cropW;
            cardCanvas.height = cropH;
            cCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            const result = await extractNameLocally(cardCanvas);
            setDetectedData(result);
            if (result && result.name && result.number) {
              verifyAndVault(result);
            }
          }
          setIsProcessing(false);
        }
      }, 400);
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, isVerifying, corners, isProcessing, scanResult]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD: Perspective Locked Mesh */}
      {corners && viewBox.w > 0 && !scanResult && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
             <path 
                d={`M ${corners.tl.x} ${corners.tl.y} L ${corners.tr.x} ${corners.tr.y} L ${corners.br.x} ${corners.br.y} L ${corners.bl.x} ${corners.bl.y} Z`}
                className={`fill-transparent stroke-[4px] transition-all duration-300 ${detectedData?.name ? 'stroke-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,1)]' : 'stroke-white/60 animate-pulse'}`}
             />
             
             {[corners.tl, corners.tr, corners.bl, corners.br].map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="8" className="fill-cyan-400 stroke-black stroke-2" />
             ))}
          </svg>

          {/* Sync Timer Bar */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-32 w-48 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-2xl overflow-hidden">
             <div 
                className="h-1 bg-cyan-400 rounded-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(34,211,238,1)]" 
                style={{ width: `${lockProgress}%` }}
             />
             <div className="mt-2 text-center text-[7px] font-orbitron font-black text-cyan-400 uppercase tracking-widest">
                PERSPECTIVE_LOCK_SESSION
             </div>
          </div>

          <div 
            style={{ left: `${(corners.tl.x / viewBox.w) * 100}%`, top: `${(corners.tl.y / viewBox.h) * 100}%` }}
            className="absolute -translate-y-24 translate-x-4 flex flex-col gap-2 scale-90 sm:scale-100"
          >
             <div className="flex gap-2">
                <span className={`px-3 py-1.5 text-[11px] font-orbitron font-black uppercase rounded shadow-2xl backdrop-blur-md ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-900/90 text-slate-500 border border-white/10'}`}>
                  {detectedData?.name || 'ANALYZING_CORE...'}
                </span>
             </div>
             {isProcessing && (
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
                   <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                   <span className="text-[9px] font-orbitron text-cyan-400 font-bold uppercase tracking-widest">Warping_Visual_Buffer_</span>
                </div>
             )}
          </div>
        </div>
      )}

      {/* Success/Verification Screens */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        {isVerifying && !scanResult && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <div className="w-32 h-32 border-4 border-cyan-400 border-solid border-t-transparent rounded-full animate-spin shadow-[0_0_80px_rgba(34,211,238,0.3)]"></div>
                <div className="mt-12 text-cyan-400 font-orbitron font-black text-2xl tracking-[0.6em] animate-pulse uppercase">Asset_Registry_Check</div>
            </div>
        )}

        {scanResult && (
           <div className="bg-slate-900/98 backdrop-blur-3xl border-4 border-green-500/50 p-20 rounded-[6rem] shadow-[0_0_200px_rgba(34,197,94,0.3)] animate-in zoom-in-90 duration-500 text-center relative overflow-hidden">
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(34,197,94,0.5)] animate-bounce">
                  <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="relative z-10">
                <div className="text-5xl font-orbitron font-black text-white mb-3 uppercase tracking-tighter drop-shadow-2xl">{scanResult.name}</div>
                <div className="text-4xl font-orbitron text-green-400 font-bold tracking-tight mb-8">{scanResult.price}</div>
                <div className="bg-green-500/20 text-green-400 py-3 px-10 rounded-full border border-green-500/30 inline-block">
                    <span className="text-[12px] font-orbitron font-black uppercase tracking-[0.4em]">Vault_Secured</span>
                </div>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Dashboard */}
      <div className="absolute bottom-10 left-0 w-full px-10 flex justify-between items-end">
        <div className="bg-slate-950/90 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/10 shadow-3xl min-w-[240px]">
           <div className="flex items-center gap-4 mb-4">
             <div className={`w-3 h-3 rounded-full ${cvReady ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
             <span className="text-[11px] font-orbitron font-black text-white uppercase tracking-widest">
                {corners ? 'PERSPECTIVE_LOCKED' : 'SEEKING_TARGET'}
             </span>
           </div>
           <div className="space-y-2">
             <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Search Integrity:</span>
                <span className="text-[8px] text-cyan-400 font-black uppercase tracking-tight">STABLE_v2</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Current Action:</span>
                <span className={`text-[8px] font-black uppercase tracking-tight ${corners ? 'text-green-400' : 'text-slate-600'}`}>
                   {corners ? 'IDENTIFYING_RETRY' : 'ANALYZING_FEED'}
                </span>
             </div>
           </div>
        </div>

        <button 
            onClick={handleReset}
            className="pointer-events-auto bg-slate-900/90 hover:bg-red-600 backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 group"
        >
            <svg className="w-8 h-8 text-white group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
