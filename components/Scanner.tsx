
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

const SCAN_STATUS_MESSAGES = [
  "LOCKING_PERSPECTIVE...",
  "EXTRACTING_NEURAL_FEATURES...",
  "SAMPLING_NAME_SECTOR...",
  "DECODING_SET_ID...",
  "QUERYING_GLOBAL_ARCHIVES...",
  "MATCHING_ART_HEURISTICS...",
  "VERIFYING_HOLOGRAPHY..."
];

const TARGET_REGIONS = {
  name: { u: 0.05, v: 0.02, uw: 0.65, vh: 0.09 },
  number: { u: 0.02, v: 0.88, uw: 0.40, vh: 0.10 }
};

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAIScanTime = useRef<number>(0);
  const animationFrameRef = useRef<number>(null);

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
  const [statusIdx, setStatusIdx] = useState(0);
  
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
        onCardDetected({ 
          ...res, 
          id: Math.random().toString(36).substr(2,9), 
          scanDate: new Date().toLocaleDateString(), 
          imageUrl: `data:image/jpeg;base64,${base64}` 
        });
        setScanResult({ name: res.name, price: res.marketValue || "--" });
        setTimeout(() => setScanResult(null), 2500);
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
          tl: { x: lerp(p.tl.x, targetCorners.tl.x, 0.25), y: lerp(p.tl.y, targetCorners.tl.y, 0.25) },
          tr: { x: lerp(p.tr.x, targetCorners.tr.x, 0.25), y: lerp(p.tr.y, targetCorners.tr.y, 0.25) },
          bl: { x: lerp(p.bl.x, targetCorners.bl.x, 0.25), y: lerp(p.bl.y, targetCorners.bl.y, 0.25) },
          br: { x: lerp(p.br.x, targetCorners.br.x, 0.25), y: lerp(p.br.y, targetCorners.br.y, 0.25) }
        } : targetCorners);
      } else {
        setVisualCorners(null);
      }

      if (targetCorners) {
        setJitter({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 });
        setStatusIdx(prev => (Date.now() % 5000 < 100 ? (prev + 1) % SCAN_STATUS_MESSAGES.length : prev));
      }

      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => animationFrameRef.current && cancelAnimationFrame(animationFrameRef.current);
  }, [targetCorners]);

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
      cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 31, 10);
      
      let contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxA = 0, found: CardCorners | null = null;
      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i), area = cv.contourArea(cnt);
        if (area > (c.width * c.height * 0.15)) {
          let approx = new cv.Mat(), peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] * 2, y: approx.data32S[j * 2 + 1] * 2 });
            const sum = [...pts].sort((a,b) => (a.x+a.y)-(b.x+b.y));
            const diff = [...pts].sort((a,b) => (a.y-a.x)-(b.y-b.x));
            const potential = { tl: sum[0], br: sum[3], tr: diff[0], bl: diff[3] };
            if (area > maxA) { maxA = area; found = potential; }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (found) { 
        setTargetCorners(found); 
        if (!isDeepScanning && !scanResult && Date.now() - lastAIScanTime.current > 6000) {
          const snapshot = document.createElement('canvas');
          snapshot.width = v.videoWidth;
          snapshot.height = v.videoHeight;
          snapshot.getContext('2d')?.drawImage(v, 0, 0);
          processAILookup(snapshot.toDataURL('image/jpeg', 0.85).split(',')[1]);
        }
      } else {
        setTargetCorners(null);
      }

      src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {}
  }, [cvReady, isDeepScanning, scanResult]);

  const runLocalOCR = useCallback(async () => {
    if (!cvReady || !targetCorners || isProcessingLocal || scanResult || !videoRef.current || !cardCanvasRef.current) return;
    setIsProcessingLocal(true);
    try {
      const v = videoRef.current;
      const corners = targetCorners;
      
      // Upscale the warped card for better OCR (400x560 -> 600x840)
      let src = cv.imread(v), dst = new cv.Mat(), dsize = new cv.Size(400, 560);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 400, 0, 400, 560, 0, 560]);
      let M = cv.getPerspectiveTransform(sc, dc);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      
      // Perform local image enhancement with OpenCV before OCR if needed, 
      // but for now we pass the clean warped card to ocrService which does its own binarization
      cv.imshow(cardCanvasRef.current, dst);
      
      const ocrData = await extractNameLocally(cardCanvasRef.current);
      if (ocrData) {
        setDetectedData(ocrData);
        if (ocrData.name && ocrData.name !== "Scanning..." && ocrData.number !== "???") {
          onCardDetected({ 
            id: Math.random().toString(36).substr(2,9), 
            name: ocrData.name, 
            number: ocrData.number, 
            set: "Local Scan", 
            rarity: "Common", 
            type: "Unknown", 
            marketValue: "$--.--", 
            scanDate: new Date().toLocaleDateString(), 
            imageUrl: cardCanvasRef.current.toDataURL() 
          });
          setScanResult({ name: ocrData.name, price: "--" });
          setTimeout(() => setScanResult(null), 2000);
        }
      }
      src.delete(); dst.delete(); M.delete(); sc.delete(); dc.delete();
    } catch (e) {} finally { setIsProcessingLocal(false); }
  }, [cvReady, targetCorners, isProcessingLocal, scanResult, onCardDetected]);

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
      
      <div className="absolute inset-0 z-20 pointer-events-none">
         {viewBox.w > 0 && visualCorners && (
           <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
              <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} 
                className="fill-cyan-400/5 stroke-[4px] stroke-cyan-400/60 transition-all duration-75" 
                style={{ transform: `translate(${jitter.x}px, ${jitter.y}px)` }}
              />
              
              <path 
                d={getQuadPath(visualCorners, TARGET_REGIONS.name)} 
                className="fill-cyan-500/10 stroke-1 stroke-white/40 animate-pulse"
              />
              <text 
                x={getQuadPoint(visualCorners, TARGET_REGIONS.name.u, TARGET_REGIONS.name.v).x} 
                y={getQuadPoint(visualCorners, TARGET_REGIONS.name.u, TARGET_REGIONS.name.v).y - 8}
                className="fill-white font-orbitron font-black text-[10px] uppercase tracking-wider"
              >
                NAME_SECTOR
              </text>

              <path 
                d={getQuadPath(visualCorners, TARGET_REGIONS.number)} 
                className="fill-cyan-500/10 stroke-1 stroke-white/40 animate-pulse"
              />
              <text 
                x={getQuadPoint(visualCorners, TARGET_REGIONS.number.u, TARGET_REGIONS.number.v).x} 
                y={getQuadPoint(visualCorners, TARGET_REGIONS.number.u, TARGET_REGIONS.number.v).y - 8}
                className="fill-white font-orbitron font-black text-[10px] uppercase tracking-wider"
              >
                ID_SECTOR
              </text>

              {[visualCorners.tl, visualCorners.tr, visualCorners.bl, visualCorners.br].map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="6" className="fill-white" />
                  <circle cx={p.x} cy={p.y} r="12" className="fill-transparent stroke-cyan-400 stroke-1 animate-ping" />
                </g>
              ))}
           </svg>
         )}
      </div>

      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full px-8">
        <div className={`bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-2xl px-8 py-4 shadow-2xl flex items-center gap-6 transition-all duration-300 ${visualCorners ? 'border-cyan-400/50 shadow-cyan-400/10' : ''}`}>
           <div className="flex flex-col">
              <span className="text-[9px] font-orbitron font-black text-cyan-400 tracking-[0.4em] uppercase mb-1">
                {visualCorners ? SCAN_STATUS_MESSAGES[statusIdx] : 'SEARCHING_ENVIRONMENT'}
              </span>
              <span className="text-xl md:text-2xl font-orbitron font-black text-white uppercase tracking-tighter">
                {detectedData?.name || (isDeepScanning ? 'AI_ARCHIVE_SYNC...' : 'AWAITING_LOCK...')}
              </span>
           </div>
        </div>
      </div>

      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[70]">
           <div className="bg-slate-950/98 backdrop-blur-3xl border-4 border-cyan-500/40 p-12 rounded-[3rem] shadow-[0_0_150px_rgba(34,211,238,0.3)] animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
              <div className="w-16 h-16 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="text-3xl font-orbitron font-black text-white mb-2 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="text-[10px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">SYNCHRONIZED_TO_VAULT</div>
           </div>
        </div>
      )}

      <div className="absolute bottom-12 left-0 right-0 z-50 px-12 flex justify-between items-center pointer-events-auto">
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="backdrop-blur-3xl p-6 rounded-2xl border border-white/10 bg-slate-900/90 text-cyan-400 shadow-2xl transition-all active:scale-90"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        
        {torchSupported && (
          <button 
            onClick={toggleTorch} 
            className={`backdrop-blur-3xl p-6 rounded-2xl border border-white/10 shadow-2xl transition-all active:scale-90 ${isTorchOn ? 'bg-amber-400 text-white' : 'bg-slate-900/90 text-slate-400'}`}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
