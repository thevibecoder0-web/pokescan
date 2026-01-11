
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
  "ANALYZING_GEOMETRY...",
  "SETTLING_COORDINATES...",
  "SAMPLING_TEXT_PIXELS...",
  "CROSS_REFERENCING_DB...",
  "VERIFYING_HOLOGRAPHY...",
  "ESTIMATING_VALUATION..."
];

const TARGET_REGIONS = {
  name: { x: 5, y: 2, w: 65, h: 9 },
  number: { x: 2, y: 88, w: 40, h: 10 }
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
  const [freezeCountdown, setFreezeCountdown] = useState(50);
  const [statusIdx, setStatusIdx] = useState(0);
  
  // States for "moving" boxes to simulate live tracking
  const [jitter, setJitter] = useState({ x: 0, y: 0 });
  const [nameBoxOffset, setNameBoxOffset] = useState({ x: 0, y: 0 });
  const [idBoxOffset, setIdBoxOffset] = useState({ x: 0, y: 0 });

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
        setFreezeCountdown(50);
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

      // Continuous jitter for scanning look
      if (isFrozen) {
        setJitter({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 });
        setNameBoxOffset({ x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5 });
        setIdBoxOffset({ x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5 });
      }

      animationFrameRef.current = requestAnimationFrame(anim);
    };
    animationFrameRef.current = requestAnimationFrame(anim);
    return () => animationFrameRef.current && cancelAnimationFrame(animationFrameRef.current);
  }, [targetCorners, isFrozen]);

  useEffect(() => {
    let timer: number;
    if (isFrozen) {
      if (videoRef.current) videoRef.current.pause(); 
      timer = window.setInterval(() => {
        const elapsed = (Date.now() - freezeStartTimeRef.current) / 1000;
        const maxTime = 50; 
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
           setFreezeCountdown(50);
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
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className={`w-full h-full object-cover transition-all duration-700 ${showWarped ? 'opacity-20 blur-xl scale-110' : 'opacity-80 scale-100'}`} 
      />
      
      <div className={`absolute inset-0 z-10 flex items-center justify-center transition-all duration-500 transform ${showWarped ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}>
          <div className="relative w-full h-full max-w-[90vw] max-h-[85vh] flex items-center justify-center">
            <div className="relative w-full h-full flex items-center justify-center group">
              <div 
                className="relative w-full h-full flex items-center justify-center"
                style={{ transform: `translate(${jitter.x}px, ${jitter.y}px)` }}
              >
                <canvas 
                  ref={cardCanvasRef} 
                  className={`w-full h-full object-contain shadow-[0_0_100px_rgba(34,211,238,0.3)] border-4 rounded-3xl transition-all duration-150 ${isFrozen ? 'border-cyan-400 brightness-110' : 'border-white/20'}`}
                />
              </div>
              
              {/* Live Telemetry Sector Boxes */}
              {isFrozen && (
                <div className="absolute inset-0 pointer-events-none z-30">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <div className="relative aspect-[400/560] h-full max-h-full">
                      
                      {/* Name Detection Zone */}
                      <div 
                        className="absolute border-2 border-cyan-400 bg-cyan-400/10 rounded-sm shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all duration-75"
                        style={{ 
                          left: `${TARGET_REGIONS.name.x + nameBoxOffset.x}%`, 
                          top: `${TARGET_REGIONS.name.y + nameBoxOffset.y}%`, 
                          width: `${TARGET_REGIONS.name.w}%`, 
                          height: `${TARGET_REGIONS.name.h}%` 
                        }}
                      >
                        <div className="absolute top-0 left-0 text-[7px] font-orbitron font-black text-white bg-cyan-600 px-1.5 py-0.5 -translate-y-full flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          SECTOR_NAME: ACTIVE
                        </div>
                        {/* Internal Scanning Grid for the box */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.2)_1px,transparent_1px)] bg-[size:10px_10px]" />
                      </div>

                      {/* ID Detection Zone */}
                      <div 
                        className="absolute border-2 border-cyan-400 bg-cyan-400/10 rounded-sm shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all duration-75"
                        style={{ 
                          left: `${TARGET_REGIONS.number.x + idBoxOffset.x}%`, 
                          top: `${TARGET_REGIONS.number.y + idBoxOffset.y}%`, 
                          width: `${TARGET_REGIONS.number.w}%`, 
                          height: `${TARGET_REGIONS.number.h}%` 
                        }}
                      >
                        <div className="absolute top-0 left-0 text-[7px] font-orbitron font-black text-white bg-cyan-600 px-1.5 py-0.5 -translate-y-full flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          SECTOR_ID: SEARCHING
                        </div>
                        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.2)_1px,transparent_1px)] bg-[size:10px_10px]" />
                      </div>

                      {/* Moving Coordinate Points on edges */}
                      <div className="absolute -left-4 top-1/2 -translate-y-1/2 h-20 w-1 bg-cyan-400/50 flex flex-col items-center justify-between py-2">
                        <div className="w-3 h-0.5 bg-cyan-400" />
                        <div className="w-3 h-0.5 bg-cyan-400" />
                      </div>
                      <div className="absolute -right-4 top-1/2 -translate-y-1/2 h-20 w-1 bg-cyan-400/50 flex flex-col items-center justify-between py-2">
                        <div className="w-3 h-0.5 bg-cyan-400" />
                        <div className="w-3 h-0.5 bg-cyan-400" />
                      </div>

                      {/* Corner Sight Markers */}
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Global Scanning Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50" />
            
            {isFrozen && (
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-slate-950/40 backdrop-blur-[1px] z-40">
                  <div className="relative mb-12">
                     <div className="w-32 h-32 border-8 border-cyan-400/20 rounded-full" />
                     <div className="absolute inset-0 w-32 h-32 border-8 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-orbitron font-black text-white drop-shadow-[0_0_10px_rgba(34,211,238,1)]">{freezeCountdown}s</span>
                     </div>
                  </div>
                  
                  <div className="bg-slate-900 border border-cyan-400/40 px-10 py-4 rounded-xl flex flex-col items-center gap-2 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-b-4">
                     <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                           {[...Array(3)].map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />
                           ))}
                        </div>
                        <span className="text-[12px] font-orbitron font-black text-white uppercase tracking-[0.2em] whitespace-nowrap">
                           {SCAN_STATUS_MESSAGES[statusIdx]}
                        </span>
                     </div>
                     <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                        {/* Fix: Using (50 - freezeCountdown) to calculate elapsed percentage for the progress bar as 'elapsed' is not in scope here */}
                        <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${((50 - freezeCountdown) / 50) * 100}%` }} />
                     </div>
                  </div>
               </div>
            )}
          </div>
      </div>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
        <div className={`bg-slate-900/80 backdrop-blur-2xl border-2 border-white/10 rounded-full px-10 py-5 shadow-2xl flex items-center gap-6 transition-all duration-300 ${isFrozen ? 'border-cyan-400/50 ring-4 ring-cyan-400/10' : ''}`}>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-orbitron font-black text-white uppercase tracking-tighter">
              {detectedData?.name || (isDeepScanning ? 'SEARCHING ARCHIVES...' : (isFrozen ? 'SIGNAL LOCKED' : 'AWAITING ASSET...'))}
            </span>
            {detectedData?.number && (
              <>
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]" />
                <span className="text-2xl font-orbitron font-bold text-cyan-400">
                  #{detectedData.number}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[60]">
           <div className="bg-slate-900/98 backdrop-blur-3xl border-4 border-cyan-500/50 p-20 rounded-[4rem] shadow-[0_0_200px_rgba(34,211,238,0.4)] animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
              <div className="w-24 h-24 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(34,211,238,0.6)]"><svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg></div>
              <div className="text-5xl font-orbitron font-black text-white mb-4 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="bg-cyan-500/20 text-cyan-400 py-3 px-12 rounded-full border border-cyan-500/40 inline-block font-orbitron font-black uppercase text-xs tracking-[0.3em]">SYNCHRONIZED</div>
           </div>
        </div>
      )}

      <div className="absolute bottom-12 left-0 right-0 z-50 px-12 flex justify-between items-center pointer-events-none">
        {!isFrozen && (
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="pointer-events-auto backdrop-blur-2xl p-7 rounded-3xl border border-white/10 bg-slate-900/90 text-cyan-400 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all active:scale-90 hover:bg-slate-800 hover:border-cyan-400/50"
          >
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
        )}
        
        {torchSupported && !isFrozen && (
          <button 
            onClick={toggleTorch} 
            className={`pointer-events-auto backdrop-blur-2xl p-7 rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all active:scale-90 ${isTorchOn ? 'bg-amber-400 text-white shadow-[0_0_30px_rgba(251,191,36,0.5)]' : 'bg-slate-900/90 text-slate-400'}`}
          >
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
