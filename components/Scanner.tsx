
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult, initOCRWorker } from '../services/ocrService';
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

const TARGET_REGIONS = {
  name: { u: 0.05, v: 0.02, uw: 0.70, vh: 0.09 },
  number: { u: 0.02, v: 0.88, uw: 0.40, vh: 0.10 }
};

// Standard Pokemon Card Ratio (Width / Height) = 63 / 88 ≈ 0.716
const TARGET_RATIO = 0.716;
const RATIO_TOLERANCE = 0.12; 

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAIScanTime = useRef<number>(0);
  const lastLocalOCRTime = useRef<number>(0);
  const animationFrameRef = useRef<number>(null);
  const processedNames = useRef<Set<string>>(new Set());

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [detectedData, setDetectedData] = useState<OCRResult | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  
  const [targetCorners, setTargetCorners] = useState<CardCorners | null>(null);
  const [visualCorners, setVisualCorners] = useState<CardCorners | null>(null);
  const [viewBox, setViewBox] = useState({ w: 0, h: 0 });
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [stabilityScore, setStabilityScore] = useState(0);
  
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

  const processAILookup = async (base64: string) => {
    if (isDeepScanning) return;
    setIsDeepScanning(true);
    lastAIScanTime.current = Date.now();
    try {
      const res = await identifyPokemonCard(base64);
      if (res && res.name && !processedNames.current.has(res.name)) {
        processedNames.current.add(res.name);
        onCardDetected({ 
          ...res, 
          id: Math.random().toString(36).substr(2,9), 
          scanDate: new Date().toLocaleDateString(), 
          imageUrl: `data:image/jpeg;base64,${base64}` 
        });
        setScanResult({ name: res.name, price: res.marketValue || "--" });
        setTimeout(() => setScanResult(null), 3000);
      }
    } catch (e) {
      console.error("Deep AI Scan Fail", e);
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
        setJitter({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 });
      } else {
        setVisualCorners(null);
      }
      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => animationFrameRef.current && cancelAnimationFrame(animationFrameRef.current);
  }, [targetCorners]);

  /**
   * Robust pose estimation helper to filter outliers.
   * Checks for convexity, internal angles (avoiding skewed rhomboids), and relative side lengths.
   */
  const validateQuadGeometry = (pts: Point[]): boolean => {
    if (pts.length !== 4) return false;
    
    // Check convexity using cross product
    const crossProduct = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    let signs = pts.map((p, i) => crossProduct(p, pts[(i + 1) % 4], pts[(i + 2) % 4]) > 0);
    if (!signs.every(s => s === signs[0])) return false;

    // Side lengths
    const d1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y); // top
    const d2 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y); // right
    const d3 = Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y); // bottom
    const d4 = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y); // left

    // Check aspect ratio (width vs height)
    const ratio = ((d1 + d3) / 2) / ((d2 + d4) / 2);
    if (Math.abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE) return false;

    // Check parallel consistency (opposite sides should be somewhat similar in length)
    if (Math.abs(d1 - d3) / Math.max(d1, d3) > 0.3) return false;
    if (Math.abs(d2 - d4) / Math.max(d2, d4) > 0.3) return false;

    return true;
  };

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
        if (area > (c.width * c.height * 0.10)) {
          let approx = new cv.Mat(), peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.025 * peri, true);
          
          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] * 2, y: approx.data32S[j * 2 + 1] * 2 });
            
            // Sort points properly for mapping
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
        setStabilityScore(s => Math.min(s + 1, 15));
        
        // Trigger high-quality AI scan if pose is stable
        if (stabilityScore > 8 && !isDeepScanning && !scanResult && Date.now() - lastAIScanTime.current > 6000) {
          const snapshot = document.createElement('canvas');
          snapshot.width = v.videoWidth;
          snapshot.height = v.videoHeight;
          snapshot.getContext('2d')?.drawImage(v, 0, 0);
          processAILookup(snapshot.toDataURL('image/jpeg', 0.82).split(',')[1]);
        }
      } else {
        setTargetCorners(null);
        setStabilityScore(s => Math.max(s - 2, 0));
      }

      src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Error", e);
    }
  }, [cvReady, isDeepScanning, scanResult, stabilityScore]);

  const runLocalOCR = useCallback(async () => {
    if (!cvReady || !targetCorners || isProcessingLocal || scanResult || !videoRef.current || !cardCanvasRef.current) return;
    if (stabilityScore < 5) return; // Wait for stable geometry
    if (Date.now() - lastLocalOCRTime.current < 1200) return;
    
    setIsProcessingLocal(true);
    lastLocalOCRTime.current = Date.now();
    try {
      const v = videoRef.current;
      const corners = targetCorners;
      
      let src = cv.imread(v), dst = new cv.Mat(), dsize = new cv.Size(400, 560);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 400, 0, 400, 560, 0, 560]);
      let M = cv.getPerspectiveTransform(sc, dc);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      cv.imshow(cardCanvasRef.current, dst);
      
      const ocrData = await extractNameLocally(cardCanvasRef.current);
      if (ocrData && ocrData.name && ocrData.name !== "Unknown Asset" && ocrData.name.length > 2) {
        setDetectedData(ocrData);
        
        // IMMEDIATE ADDITION IF CONFIDENT & UNIQUE
        if (!processedNames.current.has(ocrData.name)) {
          processedNames.current.add(ocrData.name);
          onCardDetected({ 
            id: Math.random().toString(36).substr(2,9), 
            name: ocrData.name, 
            number: ocrData.number || "???", 
            set: "Neural Local", 
            rarity: "Standard", 
            type: "Digital Scan", 
            marketValue: "$--.--", 
            scanDate: new Date().toLocaleDateString(), 
            imageUrl: cardCanvasRef.current.toDataURL() 
          });
          setScanResult({ name: ocrData.name, price: "--" });
          setTimeout(() => setScanResult(null), 2500);
        }
      }
      src.delete(); dst.delete(); M.delete(); sc.delete(); dc.delete();
    } catch (e) {
      console.warn("Local OCR Error", e);
    } finally {
      setIsProcessingLocal(false);
    }
  }, [cvReady, targetCorners, isProcessingLocal, scanResult, onCardDetected, stabilityScore]);

  useEffect(() => {
    let int: number;
    if (isScanning && cvReady) {
      int = window.setInterval(() => {
        detectCardWithCV();
        if (targetCorners) runLocalOCR();
      }, 200);
    }
    return () => clearInterval(int);
  }, [isScanning, cvReady, targetCorners, detectCardWithCV, runLocalOCR]);

  const getQuadPoint = (c: CardCorners, u: number, v: number) => ({
    x: (1 - u) * (1 - v) * c.tl.x + u * (1 - v) * c.tr.x + (1 - u) * v * c.bl.x + u * v * c.br.x,
    y: (1 - u) * (1 - v) * c.tl.y + u * (1 - v) * c.tr.y + (1 - u) * v * c.bl.y + u * v * c.br.y
  });

  const getQuadPath = (c: CardCorners, r: { u: number, v: number, uw: number, vh: number }) => {
    const p1 = getQuadPoint(c, r.u, r.v);
    const p2 = getQuadPoint(c, r.u + r.uw, r.v);
    const p3 = getQuadPoint(c, r.u + r.uw, r.v + r.vh);
    const p4 = getQuadPoint(c, r.u, r.v + r.vh);
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD OVERLAY */}
      <div className="absolute inset-0 z-20 pointer-events-none">
         {viewBox.w > 0 && visualCorners && (
           <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
              <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} 
                className={`fill-cyan-400/5 stroke-[8px] transition-all duration-150 ${stabilityScore > 10 ? 'stroke-cyan-400' : 'stroke-cyan-400/40'}`} 
                style={{ transform: `translate(${jitter.x}px, ${jitter.y}px)` }}
              />
              
              <path 
                d={getQuadPath(visualCorners, TARGET_REGIONS.name)} 
                className="fill-white/10 stroke-1 stroke-white/40 animate-pulse"
              />
              <path 
                d={getQuadPath(visualCorners, TARGET_REGIONS.number)} 
                className="fill-white/10 stroke-1 stroke-white/40 animate-pulse"
              />

              <g className="font-orbitron font-black text-[10px] fill-cyan-400 tracking-widest">
                <text x={getQuadPoint(visualCorners, TARGET_REGIONS.name.u, TARGET_REGIONS.name.v).x} y={getQuadPoint(visualCorners, TARGET_REGIONS.name.u, TARGET_REGIONS.name.v).y - 12}>SCAN_NAME_BUF</text>
                <text x={getQuadPoint(visualCorners, TARGET_REGIONS.number.u, TARGET_REGIONS.number.v).x} y={getQuadPoint(visualCorners, TARGET_REGIONS.number.u, TARGET_REGIONS.number.v).y - 12}>SCAN_ID_BUF</text>
              </g>

              <g className="fill-white stroke-cyan-400 stroke-2 shadow-2xl">
                <circle cx={visualCorners.tl.x} cy={visualCorners.tl.y} r="10" />
                <circle cx={visualCorners.tr.x} cy={visualCorners.tr.y} r="10" />
                <circle cx={visualCorners.bl.x} cy={visualCorners.bl.y} r="10" />
                <circle cx={visualCorners.br.x} cy={visualCorners.br.y} r="10" />
              </g>
           </svg>
         )}
         
         <div className="absolute inset-0 border-[40px] border-slate-950/20 pointer-events-none" />
         <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:30px_30px]" />
      </div>

      {/* STATUS PANEL */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-full px-8 flex flex-col items-center">
        <div className={`bg-slate-900/98 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] px-12 py-6 shadow-2xl transition-all duration-500 ${visualCorners ? 'border-cyan-400/60 scale-105' : 'opacity-80'}`}>
           <div className="flex flex-col text-center">
              <span className="text-[9px] font-orbitron font-black text-cyan-400 tracking-[0.5em] uppercase mb-2">
                {stabilityScore > 10 ? 'PRECISION_LOCK_ACTIVE' : 'SYNCHRONIZING_COORDINATES'}
              </span>
              <h2 className="text-2xl md:text-3xl font-orbitron font-black text-white uppercase tracking-tighter">
                {detectedData?.name || (isDeepScanning ? 'AI_ARCHIVE_SYNC...' : 'AWAITING_INPUT')}
              </h2>
           </div>
        </div>
      </div>

      {/* ASSET CAPTURED OVERLAY */}
      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[70]">
           <div className="bg-slate-950/98 backdrop-blur-3xl border-4 border-cyan-500/60 p-16 rounded-[4rem] shadow-[0_0_150px_rgba(34,211,238,0.4)] animate-in zoom-in-90 duration-300 text-center relative overflow-hidden">
              <div className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce shadow-2xl">
                <svg className="w-12 h-12 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="text-4xl font-orbitron font-black text-white mb-3 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="text-[10px] font-orbitron font-black text-cyan-400 tracking-[0.4em] uppercase">ASSET_REGISTERED_IN_VAULT</div>
           </div>
        </div>
      )}

      {/* CONTROLS */}
      <div className="absolute bottom-16 left-0 right-0 z-50 px-14 flex justify-between items-center">
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="pointer-events-auto backdrop-blur-3xl p-7 rounded-[2.2rem] border border-white/10 bg-slate-900/90 text-cyan-400 shadow-2xl hover:bg-slate-800 transition-all active:scale-90"
        >
          <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        
        {torchSupported && (
          <button 
            onClick={toggleTorch} 
            className={`pointer-events-auto backdrop-blur-3xl p-7 rounded-[2.2rem] border border-white/10 shadow-2xl transition-all active:scale-90 ${isTorchOn ? 'bg-cyan-500 text-slate-950 shadow-cyan-400/40' : 'bg-slate-900/90 text-slate-400'}`}
          >
            <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => processAILookup(ev.target?.result?.toString().split(',')[1] || "");
            reader.readAsDataURL(file);
          }
      }} />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
