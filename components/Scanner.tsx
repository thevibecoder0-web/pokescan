
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractAllCardText, OCRResult, initOCRWorker } from '../services/ocrService';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';

declare var cv: any;

interface Point { x: number; y: number; }
interface CardCorners { tl: Point; tr: Point; bl: Point; br: Point; }

interface ScannerProps {
  onCardDetected: (card: PokemonCard) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
}

const TARGET_RATIO = 0.716;
const RATIO_TOLERANCE = 0.15; 
const MAX_STABILITY = 40;
const QUALITY_THRESHOLD = 0.65; // Snappier trigger: ~65% quality for capture

// Fallback image for failed ID
const DEFAULT_UNFOUND_IMAGE = "https://images.pokemontcg.io/swsh3/30_hires.png";

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fixed: Added animationFrameRef to manage requestAnimationFrame lifecycle
  const animationFrameRef = useRef<number | null>(null);
  
  const lastAIScanTime = useRef<number>(0);
  const lockStartTimeRef = useRef<number>(0);
  const lockTriggeredRef = useRef<boolean>(false);
  const processedTextHashes = useRef<Set<string>>(new Set());

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  
  const [targetCorners, setTargetCorners] = useState<CardCorners | null>(null);
  const [visualCorners, setVisualCorners] = useState<CardCorners | null>(null);
  const [viewBox, setViewBox] = useState({ w: 0, h: 0 });
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [stabilityScore, setStabilityScore] = useState(0);
  const [showShutter, setShowShutter] = useState(false);
  
  const [jitter, setJitter] = useState({ x: 0, y: 0 });

  useEffect(() => {
    initOCRWorker();
    const timer = setInterval(() => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        setCvReady(true);
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setStream(ms);
      const track = ms.getVideoTracks()[0];
      if (track && (track as any).getCapabilities?.().torch) setTorchSupported(true);
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setViewBox({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
          }
        };
      }
    } catch (e) { console.error("Camera Fail"); }
  };

  const toggleTorch = async () => {
    if (!stream || !torchSupported) return;
    try {
      const track = stream.getVideoTracks()[0];
      await track.applyConstraints({ advanced: [{ torch: !isTorchOn }] } as any);
      setIsTorchOn(!isTorchOn);
    } catch (e) {}
  };

  const processAILookup = async (base64: string, displayUrl: string) => {
    if (isDeepScanning) return;
    setIsDeepScanning(true);
    lastAIScanTime.current = Date.now();
    
    // Trigger visual shutter effect
    setShowShutter(true);
    setTimeout(() => setShowShutter(false), 300);

    try {
      const res = await identifyPokemonCard(base64);
      if (res && res.name && res.name !== "(unfound)") {
        const hash = `${res.name}_${res.number}_${res.set}`;
        if (!processedTextHashes.current.has(hash)) {
          processedTextHashes.current.add(hash);
          
          // AUTO-ADD: "then add the card based on the name to the collection"
          onCardDetected({ 
            ...res, 
            id: Math.random().toString(36).substr(2,9), 
            scanDate: new Date().toLocaleDateString(), 
            imageUrl: displayUrl 
          });
          
          setScanResult({ name: res.name, price: res.marketValue || "--" });
          lockTriggeredRef.current = true;
          setTimeout(() => {
            setScanResult(null);
            lockTriggeredRef.current = false;
          }, 3500);
        }
      }
    } catch (e) {
      console.error("Behind-the-scenes AI analysis failed", e);
    } finally {
      setIsDeepScanning(false);
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

  const lerp = (s: number, e: number, f: number) => s + (e - s) * f;

  useEffect(() => {
    const anim = () => {
      if (targetCorners) {
        setVisualCorners(p => p ? {
          tl: { x: lerp(p.tl.x, targetCorners.tl.x, 0.4), y: lerp(p.tl.y, targetCorners.tl.y, 0.4) },
          tr: { x: lerp(p.tr.x, targetCorners.tr.x, 0.4), y: lerp(p.tr.y, targetCorners.tr.y, 0.4) },
          bl: { x: lerp(p.bl.x, targetCorners.bl.x, 0.4), y: lerp(p.bl.y, targetCorners.bl.y, 0.4) },
          br: { x: lerp(p.br.x, targetCorners.br.x, 0.4), y: lerp(p.br.y, targetCorners.br.y, 0.4) }
        } : targetCorners);
        setJitter({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 });
      } else {
        setVisualCorners(null);
      }
      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetCorners]);

  const validateQuadGeometry = (pts: Point[]): boolean => {
    if (pts.length !== 4) return false;
    const crossProduct = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    let signs = pts.map((p, i) => crossProduct(p, pts[(i + 1) % 4], pts[(i + 2) % 4]) > 0);
    if (!signs.every(s => s === signs[0])) return false;
    const d1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const d2 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
    const d3 = Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y);
    const d4 = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y);
    const ratio = ((d1 + d3) / 2) / ((d2 + d4) / 2);
    if (Math.abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE) return false;
    return true;
  };

  const captureUnfound = useCallback(() => {
    if (lockTriggeredRef.current) return;
    lockTriggeredRef.current = true;
    onCardDetected({ 
      id: Math.random().toString(36).substr(2,9), 
      name: "(unfound)", 
      number: "---", 
      set: "Unidentified Asset", 
      rarity: "Unknown", 
      type: "Normal", 
      marketValue: "$--.--", 
      scanDate: new Date().toLocaleDateString(), 
      imageUrl: DEFAULT_UNFOUND_IMAGE 
    });
    setScanResult({ name: "(unfound)", price: "--" });
    setTimeout(() => {
        setScanResult(null);
        lockTriggeredRef.current = false;
    }, 2000);
  }, [onCardDetected]);

  const updateCardWarp = useCallback(() => {
    if (!cvReady || !targetCorners || !videoRef.current || !cardCanvasRef.current) return;
    try {
      const v = videoRef.current;
      const corners = targetCorners;
      let src = cv.imread(v);
      let dst = new cv.Mat();
      let dsize = new cv.Size(800, 1116);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 800, 0, 800, 1116, 0, 1116]);
      let M = cv.getPerspectiveTransform(sc, dc);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      cv.imshow(cardCanvasRef.current, dst);
      src.delete(); dst.delete(); M.delete(); sc.delete(); dc.delete();
    } catch (e) {
      console.warn("Warp error", e);
    }
  }, [cvReady, targetCorners]);

  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;

    c.width = v.videoWidth / 2;
    c.height = v.videoHeight / 2;
    ctx.drawImage(v, 0, 0, c.width, c.height);

    try {
      let src = cv.imread(c), gray = new cv.Mat(), blurred = new cv.Mat(), thresh = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 25, 8);
      
      let contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxA = 0, found: CardCorners | null = null;
      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i), area = cv.contourArea(cnt);
        if (area > (c.width * c.height * 0.08)) {
          let approx = new cv.Mat(), peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.025 * peri, true);
          
          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] * 2, y: approx.data32S[j * 2 + 1] * 2 });
            const sum = [...pts].sort((a,b) => (a.x+a.y)-(b.x+b.y));
            const diff = [...pts].sort((a,b) => (a.y-a.x)-(b.y-b.x));
            const potential = { tl: sum[0], br: sum[3], tr: diff[0], bl: diff[3] };

            if (validateQuadGeometry([potential.tl, potential.tr, potential.br, potential.bl])) {
              if (area > maxA) {
                maxA = area;
                found = potential;
              }
            }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (found) { 
        setTargetCorners(found);
        setStabilityScore(s => Math.min(s + 1, MAX_STABILITY));
        
        if (lockStartTimeRef.current === 0) lockStartTimeRef.current = Date.now();

        updateCardWarp();

        // Automated behind-the-scenes analysis as requested
        if (stabilityScore >= (MAX_STABILITY * QUALITY_THRESHOLD) && !isDeepScanning && !scanResult && !lockTriggeredRef.current) {
          if (cardCanvasRef.current && Date.now() - lastAIScanTime.current > 4000) {
            const highResSnapshot = cardCanvasRef.current.toDataURL('image/jpeg', 0.95);
            processAILookup(highResSnapshot.split(',')[1], highResSnapshot);
          }
        }

        // Fallback for completely unrecognizable targets after 8s
        if (stabilityScore > 10 && !lockTriggeredRef.current && !scanResult) {
            if (Date.now() - lockStartTimeRef.current > 8000) captureUnfound();
        }
      } else {
        setTargetCorners(null);
        setStabilityScore(s => Math.max(s - 4, 0));
        lockStartTimeRef.current = 0;
      }

      src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Error", e);
    }
  }, [cvReady, isDeepScanning, scanResult, stabilityScore, captureUnfound, updateCardWarp, processAILookup]);

  useEffect(() => {
    let int: number;
    if (isScanning && cvReady) {
      int = window.setInterval(detectCardWithCV, 120);
    }
    return () => clearInterval(int);
  }, [isScanning, cvReady, detectCardWithCV]);

  const currentQuality = Math.round((stabilityScore / MAX_STABILITY) * 100);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* SHUTTER EFFECT */}
      {showShutter && (
        <div className="absolute inset-0 bg-white z-[100] animate-pulse pointer-events-none opacity-40" />
      )}

      {/* SCANNER OVERLAY */}
      <div className="absolute inset-0 z-20 pointer-events-none">
         {viewBox.w > 0 && visualCorners && (
           <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
              <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} 
                className={`fill-cyan-400/5 stroke-[10px] transition-all duration-75 ${stabilityScore > 15 ? 'stroke-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)]' : 'stroke-cyan-400/30'}`} 
                style={{ transform: `translate(${jitter.x}px, ${jitter.y}px)` }}
              />
              
              <line 
                x1={visualCorners.tl.x} y1={lerp(visualCorners.tl.y, visualCorners.bl.y, (Math.sin(Date.now() / 200) + 1) / 2)}
                x2={visualCorners.tr.x} y2={lerp(visualCorners.tr.y, visualCorners.br.y, (Math.sin(Date.now() / 200) + 1) / 2)}
                className="stroke-cyan-400 stroke-[4px] opacity-80"
              />

              <g className="font-orbitron font-black text-[10px] fill-cyan-400 tracking-[0.3em]">
                <text x={visualCorners.tl.x} y={visualCorners.tl.y - 15}>ASSET_LOCKED</text>
                <text x={visualCorners.bl.x} y={visualCorners.bl.y + 25}>STABILITY: {currentQuality}%</text>
              </g>

              <g className="fill-white stroke-cyan-500 stroke-2">
                <circle cx={visualCorners.tl.x} cy={visualCorners.tl.y} r="12" />
                <circle cx={visualCorners.tr.x} cy={visualCorners.tr.y} r="12" />
                <circle cx={visualCorners.bl.x} cy={visualCorners.bl.y} r="12" />
                <circle cx={visualCorners.br.x} cy={visualCorners.br.y} r="12" />
              </g>
           </svg>
         )}
         <div className="absolute inset-0 border-[50px] border-slate-950/40 pointer-events-none" />
      </div>

      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 w-full px-10 flex flex-col items-center">
        <div className={`bg-slate-900/98 backdrop-blur-3xl border-2 border-white/10 rounded-[3rem] px-14 py-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-300 ${visualCorners ? 'border-cyan-400 scale-105' : 'opacity-60'}`}>
           <div className="flex flex-col text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className={`w-2 h-2 rounded-full ${visualCorners ? 'bg-cyan-400 animate-pulse shadow-[0_0_10px_cyan]' : 'bg-slate-700'}`} />
                <span className="text-[10px] font-orbitron font-black text-cyan-500 tracking-[0.6em] uppercase">
                  {isDeepScanning ? 'NEURAL_ANALYSIS_IN_PROGRESS' : (visualCorners ? 'DATA_SYNC_ACTIVE' : 'SEEKING_DATA_SIGNALS')}
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-orbitron font-black text-white uppercase tracking-tighter max-w-lg truncate">
                {isDeepScanning ? 'DECODING_IMAGE...' : (visualCorners ? 'ASSET_DETECTED' : 'POSITION_TARGET')}
              </h2>
              
              {visualCorners && (
                <div className="mt-4 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${stabilityScore >= 30 ? 'bg-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-slate-400'}`} 
                    style={{ width: `${currentQuality}%` }} 
                  />
                </div>
              )}
           </div>
        </div>
      </div>

      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[70]">
           <div className="bg-slate-950/98 backdrop-blur-3xl border-[8px] border-cyan-500/40 p-20 rounded-[5rem] shadow-[0_0_200px_rgba(34,211,238,0.5)] animate-in zoom-in-90 duration-200 text-center relative overflow-hidden">
              <div className="w-24 h-24 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_40px_rgba(34,211,238,0.6)]">
                <svg className="w-14 h-14 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="text-5xl font-orbitron font-black text-white mb-4 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="bg-cyan-500 text-slate-950 py-3 px-14 rounded-full font-orbitron font-black uppercase text-xs tracking-[0.3em] inline-block shadow-lg">VAULT_REGISTRATION_COMPLETE</div>
           </div>
        </div>
      )}

      <div className="absolute bottom-16 left-0 right-0 z-50 px-16 flex justify-between items-center pointer-events-none">
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="pointer-events-auto backdrop-blur-3xl p-8 rounded-[2.5rem] border-2 border-white/10 bg-slate-900/90 text-cyan-400 shadow-2xl hover:bg-slate-800 transition-all active:scale-95"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        
        {torchSupported && (
          <button 
            onClick={toggleTorch} 
            className={`pointer-events-auto backdrop-blur-3xl p-8 rounded-[2.5rem] border-2 border-white/10 shadow-2xl transition-all active:scale-95 ${isTorchOn ? 'bg-amber-400 text-slate-950 shadow-amber-400/40' : 'bg-slate-900/90 text-slate-400'}`}
          >
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const b64 = ev.target?.result?.toString() || "";
                processAILookup(b64.split(',')[1], b64);
            };
            reader.readAsDataURL(file);
          }
      }} />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
