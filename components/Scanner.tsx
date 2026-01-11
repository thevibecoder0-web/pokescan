
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

const TARGET_REGIONS = {
  name: { u: 0.05, v: 0.02, uw: 0.75, vh: 0.10 },
  number: { u: 0.02, v: 0.88, uw: 0.40, vh: 0.10 }
};

const TARGET_RATIO = 0.716;
const RATIO_TOLERANCE = 0.15; 

// Centiskorch 30/132 from Darkness Ablaze
const DEFAULT_UNFOUND_IMAGE = "https://images.pokemontcg.io/swsh3/30_hires.png";

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAIScanTime = useRef<number>(0);
  const lastLocalOCRTime = useRef<number>(0);
  const animationFrameRef = useRef<number>(null);
  
  // Requirement Tracking
  const lockStartTimeRef = useRef<number>(0);
  const lockTriggeredRef = useRef<boolean>(false);
  const processedTextHashes = useRef<Set<string>>(new Set());

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
      if (res && res.name) {
        const hash = `ai_${res.name}_${res.number}`;
        if (!processedTextHashes.current.has(hash)) {
          processedTextHashes.current.add(hash);
          onCardDetected({ 
            ...res, 
            id: Math.random().toString(36).substr(2,9), 
            scanDate: new Date().toLocaleDateString(), 
            imageUrl: `data:image/jpeg;base64,${base64}` 
          });
          setScanResult({ name: res.name, price: res.marketValue || "--" });
          lockTriggeredRef.current = true; // Found text, disable "unfound" trigger
          setTimeout(() => setScanResult(null), 3000);
        }
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
        setJitter({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 });
      } else {
        setVisualCorners(null);
      }
      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => animationFrameRef.current && cancelAnimationFrame(animationFrameRef.current);
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
    if (!videoRef.current || !cardCanvasRef.current || lockTriggeredRef.current) return;
    
    lockTriggeredRef.current = true; // Ensure single capture per lock
    
    // As per user request: if unfound, name it "(unfound)" and use Centiskorch 30/132 as default image
    onCardDetected({ 
      id: Math.random().toString(36).substr(2,9), 
      name: "(unfound)", 
      number: "30/132", 
      set: "Unidentified Set", 
      rarity: "Unknown", 
      type: "Fire", 
      marketValue: "$--.--", 
      scanDate: new Date().toLocaleDateString(), 
      imageUrl: DEFAULT_UNFOUND_IMAGE 
    });
    
    setScanResult({ name: "(unfound)", price: "--" });
    setTimeout(() => setScanResult(null), 2000);
  }, [onCardDetected]);

  /**
   * High-Frequency Perspective Warping
   * Updates cardCanvasRef with the warped card image.
   */
  const updateCardWarp = useCallback(() => {
    if (!cvReady || !targetCorners || !videoRef.current || !cardCanvasRef.current) return;
    try {
      const v = videoRef.current;
      const corners = targetCorners;
      let src = cv.imread(v);
      let dst = new cv.Mat();
      let dsize = new cv.Size(400, 560);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 400, 0, 400, 560, 0, 560]);
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
        setStabilityScore(s => Math.min(s + 1, 20));
        
        if (lockStartTimeRef.current === 0) {
            lockStartTimeRef.current = Date.now();
        }

        // Warp immediately for sharp image capture preview
        updateCardWarp();

        // 2-second timeout for "(unfound)"
        if (stabilityScore > 10 && !lockTriggeredRef.current && !scanResult) {
            if (Date.now() - lockStartTimeRef.current > 2000) {
                captureUnfound();
            }
        }
        
        // Auto-trigger AI lookup if high stability
        if (stabilityScore > 15 && !isDeepScanning && !scanResult && Date.now() - lastAIScanTime.current > 10000) {
          const snapshot = document.createElement('canvas');
          snapshot.width = v.videoWidth;
          snapshot.height = v.videoHeight;
          snapshot.getContext('2d')?.drawImage(v, 0, 0);
          processAILookup(snapshot.toDataURL('image/jpeg', 0.82).split(',')[1]);
        }
      } else {
        setTargetCorners(null);
        setStabilityScore(s => Math.max(s - 3, 0));
        lockStartTimeRef.current = 0;
        lockTriggeredRef.current = false;
      }

      src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Error", e);
    }
  }, [cvReady, isDeepScanning, scanResult, stabilityScore, captureUnfound, updateCardWarp]);

  const runLocalOCR = useCallback(async () => {
    if (!cvReady || !targetCorners || isProcessingLocal || scanResult || !videoRef.current || !cardCanvasRef.current) return;
    if (Date.now() - lastLocalOCRTime.current < 800) return;
    
    setIsProcessingLocal(true);
    lastLocalOCRTime.current = Date.now();
    try {
      const ocrData = await extractAllCardText(cardCanvasRef.current);
      if (ocrData && ocrData.fullText.length > 5) {
        setDetectedData(ocrData);
        
        const textHash = ocrData.fullText.substring(0, 30); 
        if (!processedTextHashes.current.has(textHash)) {
          processedTextHashes.current.add(textHash);
          lockTriggeredRef.current = true; // Found text, disable "unfound" trigger

          onCardDetected({ 
            id: Math.random().toString(36).substr(2,9), 
            name: ocrData.name !== "Scanning Asset..." ? ocrData.name : "Unrecognized Asset", 
            number: ocrData.number, 
            set: "Live Neural Scan", 
            rarity: "Detected", 
            type: "Digital Artifact", 
            marketValue: "$--.--", 
            scanDate: new Date().toLocaleDateString(), 
            imageUrl: cardCanvasRef.current.toDataURL() 
          });
          
          setScanResult({ name: ocrData.name !== "Scanning Asset..." ? ocrData.name : "Text Detected", price: "--" });
          setTimeout(() => setScanResult(null), 2000);
        }
      }
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
      }, 150);
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
      
      {/* SCANNER OVERLAY */}
      <div className="absolute inset-0 z-20 pointer-events-none">
         {viewBox.w > 0 && visualCorners && (
           <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
              <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} 
                className={`fill-cyan-400/5 stroke-[10px] transition-all duration-75 ${stabilityScore > 10 ? 'stroke-cyan-400' : 'stroke-cyan-400/30'}`} 
                style={{ transform: `translate(${jitter.x}px, ${jitter.y}px)` }}
              />
              
              <line 
                x1={visualCorners.tl.x} y1={lerp(visualCorners.tl.y, visualCorners.bl.y, (Math.sin(Date.now() / 200) + 1) / 2)}
                x2={visualCorners.tr.x} y2={lerp(visualCorners.tr.y, visualCorners.br.y, (Math.sin(Date.now() / 200) + 1) / 2)}
                className="stroke-cyan-400 stroke-[4px] opacity-80"
              />

              <g className="font-orbitron font-black text-[9px] fill-cyan-400 tracking-[0.3em]">
                <text x={visualCorners.tl.x} y={visualCorners.tl.y - 15}>ASSET_LOCKED</text>
                <text x={visualCorners.bl.x} y={visualCorners.bl.y + 25}>STABILITY_INDEX: {stabilityScore * 5}%</text>
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
         <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.05)_1.5px,transparent_1.5px)] bg-[size:40px_40px]" />
      </div>

      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 w-full px-10 flex flex-col items-center">
        <div className={`bg-slate-900/98 backdrop-blur-3xl border-2 border-white/10 rounded-[3rem] px-14 py-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-300 ${visualCorners ? 'border-cyan-400 scale-105' : 'opacity-60'}`}>
           <div className="flex flex-col text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className={`w-2 h-2 rounded-full ${visualCorners ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className="text-[10px] font-orbitron font-black text-cyan-500 tracking-[0.6em] uppercase">
                  {stabilityScore > 10 ? 'PRECISION_DECODE_ACTIVE' : 'STREAMING_NEURAL_DATA'}
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-orbitron font-black text-white uppercase tracking-tighter max-w-lg truncate">
                {detectedData?.name || (isProcessingLocal ? 'EXTRACTING_TEXT...' : 'SCANNING_ENVIRONMENT')}
              </h2>
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
              <div className="bg-cyan-500 text-slate-950 py-3 px-14 rounded-full font-orbitron font-black uppercase text-xs tracking-[0.3em] inline-block shadow-lg">ASSET_REGISTERED</div>
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
