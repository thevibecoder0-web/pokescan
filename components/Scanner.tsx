
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
  "LOCKED_SIGNAL: REFINING BOUNDARIES...",
  "EXTRACTING HIGH-RES TEXTURE...",
  "ISOLATING NAME_SECTOR...",
  "NEURAL CHARACTER MATCHING...",
  "QUERYING GLOBAL ARCHIVES...",
  "RETRIEVING MARKET_VALUE..."
];

const TARGET_REGIONS = {
  name: { x: '5%', y: '2%', w: '65%', h: '9%' },
  number: { x: '2%', y: '88%', w: '40%', h: '10%' }
};

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frozenFrameRef = useRef<any>(null); 
  const lockedCornersRef = useRef<CardCorners | null>(null);
  
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWarped, setShowWarped] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezeCountdown, setFreezeCountdown] = useState(5);
  const [statusIdx, setStatusIdx] = useState(0);
  
  const lastFoundTime = useRef<number>(0);
  const lastDeepScanTime = useRef<number>(0);
  const freezeStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(null);

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
        videoRef.current.onloadedmetadata = () => setViewBox({ w: videoRef.current!.videoWidth, h: videoRef.current!.videoHeight });
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imgData = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (cardCanvasRef.current) {
          const ctx = cardCanvasRef.current.getContext('2d');
          if (ctx) {
            cardCanvasRef.current.width = 400;
            cardCanvasRef.current.height = 560;
            ctx.drawImage(img, 0, 0, 400, 560);
          }
        }
        
        setIsFrozen(true);
        setShowWarped(true);
        setFreezeCountdown(10);
        freezeStartTimeRef.current = Date.now();
        
        const base64 = imgData.split(',')[1];
        processUploadedImage(base64);
      };
      img.src = imgData;
    };
    reader.readAsDataURL(file);
  };

  const processUploadedImage = async (base64: string) => {
    setIsDeepScanning(true);
    try {
      const res = await identifyPokemonCard(base64);
      if (res && res.name) {
        onCardDetected({ 
          ...res, 
          id: Math.random().toString(36).substr(2,9), 
          scanDate: new Date().toLocaleDateString(), 
          imageUrl: cardCanvasRef.current?.toDataURL() 
        });
        setScanResult({ name: res.name, price: res.marketValue || "--" });
        setTimeout(() => {
          setScanResult(null);
          setIsFrozen(false);
          setShowWarped(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }, 2000);
      }
    } catch (e) {
      console.error("Deep Scan Fail", e);
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

  useEffect(() => {
    const lerp = (s: number, e: number, f: number) => s + (e - s) * f;
    const anim = () => {
      // Keep lerping even when frozen to allow the "border adjustment" animation to finish smoothly on the still frame
      if (targetCorners) {
        setVisualCorners(p => p ? {
          tl: { x: lerp(p.tl.x, targetCorners.tl.x, 0.2), y: lerp(p.tl.y, targetCorners.tl.y, 0.2) },
          tr: { x: lerp(p.tr.x, targetCorners.tr.x, 0.2), y: lerp(p.tr.y, targetCorners.tr.y, 0.2) },
          bl: { x: lerp(p.bl.x, targetCorners.bl.x, 0.2), y: lerp(p.bl.y, targetCorners.bl.y, 0.2) },
          br: { x: lerp(p.br.x, targetCorners.br.x, 0.2), y: lerp(p.br.y, targetCorners.br.y, 0.2) }
        } : targetCorners);
        setShowWarped(true);
      } else {
        setVisualCorners(null);
        setShowWarped(false);
      }
      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => animationFrameRef.current && cancelAnimationFrame(animationFrameRef.current);
  }, [targetCorners]);

  useEffect(() => {
    let timer: number;
    if (isFrozen) {
      if (videoRef.current) videoRef.current.pause(); 
      timer = window.setInterval(() => {
        const elapsed = (Date.now() - freezeStartTimeRef.current) / 1000;
        const isUpload = !!fileInputRef.current?.value;
        const maxTime = isUpload ? 10 : 5;
        const remaining = Math.max(0, maxTime - Math.floor(elapsed));
        setFreezeCountdown(remaining);
        
        setStatusIdx(prev => (prev + 1) % SCAN_STATUS_MESSAGES.length);

        if (elapsed >= maxTime && !scanResult) {
          setIsFrozen(false);
          setTargetCorners(null);
          lockedCornersRef.current = null;
          setDetectedData(null);
          if (frozenFrameRef.current) {
            frozenFrameRef.current.delete();
            frozenFrameRef.current = null;
          }
          if (videoRef.current) videoRef.current.play();
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }, 800);
    } else {
      if (videoRef.current) videoRef.current.play();
    }
    return () => clearInterval(timer);
  }, [isFrozen, scanResult]);

  const detectCardWithCV = useCallback((sourceOverride?: any) => {
    if (!cvReady || (!sourceOverride && !videoRef.current) || !canvasRef.current) return;
    const v = sourceOverride || videoRef.current;
    const c = canvasRef.current;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Drawing from either video element or Mat
    if (sourceOverride && sourceOverride.cols) {
       cv.imshow(c, sourceOverride);
    } else {
       c.width = v.videoWidth / 2;
       c.height = v.videoHeight / 2;
       ctx.drawImage(v, 0, 0, c.width, c.height);
    }

    try {
      let src = cv.imread(c), gray = new cv.Mat(), claheMat = new cv.Mat(), blurred = new cv.Mat(), thresh = new cv.Mat(), edges = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      let clahe = new cv.CLAHE(4.0, new cv.Size(8, 8));
      clahe.apply(gray, claheMat);
      cv.GaussianBlur(claheMat, blurred, new cv.Size(9, 9), 0);
      
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 31, 10);
      cv.Canny(blurred, edges, 40, 120);
      cv.bitwise_or(thresh, edges, thresh);
      
      let k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, k);
      
      let contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxA = 0, found: CardCorners | null = null;
      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i), area = cv.contourArea(cnt);
        if (area > (c.width * c.height * 0.12)) {
          let approx = new cv.Mat(), peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] * 2, y: approx.data32S[j * 2 + 1] * 2 });
            const sum = [...pts].sort((a,b) => (a.x+a.y)-(b.x+b.y));
            const diff = [...pts].sort((a,b) => (a.y-a.x)-(b.y-b.x));
            const potential = { tl: sum[0], br: sum[3], tr: diff[0], bl: diff[3] };
            const ratio = Math.hypot(potential.tr.x-potential.tl.x, potential.tr.y-potential.tl.y) / Math.hypot(potential.bl.x-potential.tl.x, potential.bl.y-potential.tl.y);
            if (ratio > 0.55 && ratio < 0.9 && area > maxA) { maxA = area; found = potential; }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (found) { 
        setTargetCorners(found); 
        lockedCornersRef.current = found;
        lastFoundTime.current = Date.now();
        if (!isFrozen) {
           setIsFrozen(true);
           setFreezeCountdown(5);
           freezeStartTimeRef.current = Date.now();
           frozenFrameRef.current = cv.imread(videoRef.current);
        }
      } else if (!isFrozen && Date.now() - lastFoundTime.current > 300) {
        setTargetCorners(null);
      }

      src.delete(); gray.delete(); claheMat.delete(); clahe.delete(); blurred.delete(); thresh.delete(); edges.delete(); k.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {}
  }, [cvReady, isFrozen]);

  const triggerDeepScan = async () => {
    if (isDeepScanning || !cardCanvasRef.current || Date.now() - lastDeepScanTime.current < 3000) return;
    setIsDeepScanning(true);
    lastDeepScanTime.current = Date.now();
    try {
      const c = cardCanvasRef.current;
      const b64 = c.toDataURL('image/jpeg', 0.95).split(',')[1];
      const res = await identifyPokemonCard(b64);
      if (res && res.name) {
        onCardDetected({ ...res, id: Math.random().toString(36).substr(2,9), scanDate: new Date().toLocaleDateString(), imageUrl: c.toDataURL() });
        setScanResult({ name: res.name, price: res.marketValue || "--" });
        setTimeout(() => {
          setScanResult(null);
          setIsFrozen(false);
          setShowWarped(false);
        }, 2000);
      }
    } catch (e) {} finally { setIsDeepScanning(false); }
  };

  const processFrame = async () => {
    if (fileInputRef.current?.value) return;

    // Use current corners even if adjusting
    const corners = targetCorners || lockedCornersRef.current;
    if (!corners || !cvReady || isProcessing) return;
    setIsProcessing(true);
    try {
      let src = frozenFrameRef.current ? frozenFrameRef.current.clone() : cv.imread(videoRef.current);
      let dst = new cv.Mat(), dsize = new cv.Size(400, 560);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 400, 0, 400, 560, 0, 560]);
      let M = cv.getPerspectiveTransform(sc, dc);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      
      cv.imshow(cardCanvasRef.current, dst);
      
      let ocrMat = new cv.Mat();
      cv.cvtColor(dst, ocrMat, cv.COLOR_RGBA2GRAY);
      cv.bilateralFilter(ocrMat, ocrMat, 9, 75, 75);
      let kernel = cv.matFromArray(3, 3, cv.CV_32F, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
      cv.filter2D(ocrMat, ocrMat, cv.CV_8U, kernel);
      kernel.delete();
      cv.threshold(ocrMat, ocrMat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      
      const res = await extractNameLocally(cardCanvasRef.current);
      if (res) {
        setDetectedData(res);
        if (res.name && res.number) {
          onCardDetected({ id: Math.random().toString(36).substr(2,9), name: res.name, number: res.number, set: "Neural Scan", rarity: "Common", type: "Unknown", marketValue: "$--.--", scanDate: new Date().toLocaleDateString(), imageUrl: cardCanvasRef.current.toDataURL() });
          setScanResult({ name: res.name, price: "--" });
          setTimeout(() => setScanResult(null), 1500);
          setIsFrozen(false);
        }
      } else if (isFrozen && Date.now() - freezeStartTimeRef.current > 1200) {
        triggerDeepScan();
      }
      src.delete(); dst.delete(); ocrMat.delete(); M.delete(); sc.delete(); dc.delete();
    } catch (e) {} finally { setIsProcessing(false); }
  };

  useEffect(() => {
    let int: number;
    if (isScanning && cvReady && !scanResult) {
      int = window.setInterval(() => { 
        // If frozen, continue to adjust border based on the static high-res Mat
        if (isFrozen && frozenFrameRef.current) {
           detectCardWithCV(frozenFrameRef.current);
        } else if (!isFrozen) {
           detectCardWithCV(); 
        }
        
        if ((targetCorners || isFrozen) && !fileInputRef.current?.value) processFrame(); 
      }, 80);
    }
    return () => clearInterval(int);
  }, [isScanning, cvReady, targetCorners, isProcessing, scanResult, isFrozen]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      {/* Visual Tracking Overlay (Raw perspective) */}
      {!showWarped && visualCorners && viewBox.w > 0 && (
         <div className="absolute inset-0 z-20 pointer-events-none">
           <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
              <path 
                d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} 
                className="fill-cyan-400/10 stroke-[6px] stroke-cyan-400 animate-pulse" 
              />
              {[visualCorners.tl, visualCorners.tr, visualCorners.bl, visualCorners.br].map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="12" className="fill-white stroke-cyan-400 stroke-2" />
              ))}
           </svg>
      </div>
      )}

      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className={`w-full h-full object-cover transition-all duration-700 ${showWarped ? 'opacity-20 blur-xl scale-110' : 'opacity-80 scale-100'}`} 
      />
      
      <div className={`absolute inset-0 z-10 flex items-center justify-center transition-all duration-500 transform ${showWarped ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
          <div className="relative w-full h-full max-w-[90vw] max-h-[85vh] flex items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center group">
              <canvas 
                ref={cardCanvasRef} 
                className={`w-full h-full object-contain shadow-[0_0_100px_rgba(34,211,238,0.5)] border-4 rounded-3xl transition-all duration-500 ${isFrozen ? 'border-cyan-400 brightness-110' : 'border-white/20'}`}
              />
              
              {/* Telemetry Search Boxes (Visible when frozen) */}
              {isFrozen && (
                <div className="absolute inset-0 pointer-events-none z-30">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="relative aspect-[400/560] h-full max-h-full">
                      {/* Name Search Box */}
                      <div 
                        className="absolute border-2 border-cyan-400/80 bg-cyan-400/10 rounded shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse transition-all duration-300"
                        style={{ 
                          left: TARGET_REGIONS.name.x, 
                          top: TARGET_REGIONS.name.y, 
                          width: TARGET_REGIONS.name.w, 
                          height: TARGET_REGIONS.name.h 
                        }}
                      >
                        <div className="absolute top-0 left-0 text-[8px] font-orbitron font-black text-cyan-400 bg-slate-950 px-2 py-0.5 -translate-y-full border border-cyan-400/30">NAME_SECTOR</div>
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                           <div className="w-full h-[1px] bg-cyan-400/40 animate-scanline" />
                        </div>
                      </div>

                      {/* Number Search Box */}
                      <div 
                        className="absolute border-2 border-cyan-400/80 bg-cyan-400/10 rounded shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse transition-all duration-300"
                        style={{ 
                          left: TARGET_REGIONS.number.x, 
                          top: TARGET_REGIONS.number.y, 
                          width: TARGET_REGIONS.number.w, 
                          height: TARGET_REGIONS.number.h 
                        }}
                      >
                        <div className="absolute top-0 left-0 text-[8px] font-orbitron font-black text-cyan-400 bg-slate-950 px-2 py-0.5 -translate-y-full border border-cyan-400/30">ID_SECTOR</div>
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                           <div className="w-full h-[1px] bg-cyan-400/40 animate-scanline" />
                        </div>
                      </div>

                      {/* Card Outline confirmation */}
                      <div className="absolute inset-0 border-4 border-cyan-400 animate-pulse rounded-3xl opacity-40"></div>
                      <div className="absolute -inset-4 border border-cyan-400/20 rounded-[2.5rem] pointer-events-none"></div>
                    </div>
                  </div>
                </div>
              )}

              {isFrozen && (
                <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none z-20">
                   <div className="absolute w-full h-[3px] bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)] animate-scanline-sweep" />
                   <div className="absolute inset-0 bg-cyan-400/10" />
                </div>
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent h-24 w-full animate-scanline pointer-events-none" />
            
            {isFrozen && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-slate-950/20 backdrop-blur-[1px] z-40">
                  <div className="relative mb-8">
                     <div className="w-24 h-24 border-4 border-cyan-400/20 rounded-full" />
                     <div className="absolute inset-0 w-24 h-24 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-orbitron font-black text-cyan-400">{freezeCountdown}</span>
                     </div>
                  </div>
                  
                  <div className="bg-slate-900/90 border border-cyan-400/30 px-8 py-3 rounded-full flex flex-col items-center gap-1 shadow-2xl">
                     <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-[10px] font-orbitron font-black text-white uppercase tracking-[0.2em] whitespace-nowrap">
                           {SCAN_STATUS_MESSAGES[statusIdx]}
                        </span>
                     </div>
                  </div>
               </div>
            )}
          </div>
      </div>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
        <div className={`bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-full px-8 py-4 shadow-2xl flex items-center gap-6 transition-all duration-300 ${isFrozen ? 'border-cyan-400/50 ring-2 ring-cyan-400/20' : ''}`}>
          <div className="flex items-center gap-4">
            <span className="text-xl font-orbitron font-black text-white uppercase tracking-tighter">
              {detectedData?.name || (isDeepScanning ? 'SEARCHING ARCHIVES...' : (isFrozen ? 'SIGNAL LOCKED' : 'AWAITING ASSET...'))}
            </span>
            {detectedData?.number && (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                <span className="text-xl font-orbitron font-bold text-cyan-400">
                  #{detectedData.number}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[60]">
           <div className="bg-slate-900/95 backdrop-blur-3xl border-4 border-cyan-500/50 p-16 rounded-[4rem] shadow-[0_0_150px_rgba(34,211,238,0.3)] animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
              <div className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6"><svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg></div>
              <div className="text-4xl font-orbitron font-black text-white mb-2 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="bg-cyan-500/20 text-cyan-400 py-2 px-8 rounded-full border border-cyan-500/30 inline-block font-orbitron font-black uppercase text-[10px] tracking-widest">SECURED</div>
           </div>
        </div>
      )}

      <div className="absolute bottom-10 left-0 right-0 z-50 px-10 flex justify-between items-center pointer-events-none">
        {!isFrozen && (
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="pointer-events-auto backdrop-blur-xl p-6 rounded-full border border-white/10 bg-slate-900/90 text-cyan-400 shadow-2xl transition-all active:scale-90 hover:bg-slate-800"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
        )}
        
        {torchSupported && !isFrozen && (
          <button 
            onClick={toggleTorch} 
            className={`pointer-events-auto backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 ${isTorchOn ? 'bg-amber-400 text-white shadow-[0_0_30px_rgba(251,191,36,0.4)]' : 'bg-slate-900/90 text-slate-400'}`}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        )}
      </div>

      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        className="hidden" 
        onChange={handleFileUpload} 
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
