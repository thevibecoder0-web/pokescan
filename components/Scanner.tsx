
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

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
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
  
  const lastFoundTime = useRef<number>(0);
  const lastDeepScanTime = useRef<number>(0);
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
          tl: { x: lerp(p.tl.x, targetCorners.tl.x, 0.3), y: lerp(p.tl.y, targetCorners.tl.y, 0.3) },
          tr: { x: lerp(p.tr.x, targetCorners.tr.x, 0.3), y: lerp(p.tr.y, targetCorners.tr.y, 0.3) },
          bl: { x: lerp(p.bl.x, targetCorners.bl.x, 0.3), y: lerp(p.bl.y, targetCorners.bl.y, 0.3) },
          br: { x: lerp(p.br.x, targetCorners.br.x, 0.3), y: lerp(p.br.y, targetCorners.br.y, 0.3) }
        } : targetCorners);
      } else setVisualCorners(null);
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
      let src = cv.imread(c), gray = new cv.Mat(), claheMat = new cv.Mat(), blurred = new cv.Mat(), thresh = new cv.Mat(), edges = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      let clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
      clahe.apply(gray, claheMat);
      
      cv.GaussianBlur(claheMat, blurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
      cv.Canny(blurred, edges, 75, 200);
      cv.bitwise_or(thresh, edges, thresh);
      
      let k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, k);
      
      let contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxA = 0, found: CardCorners | null = null;
      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i), area = cv.contourArea(cnt);
        if (area > (c.width * c.height * 0.1)) {
          let approx = new cv.Mat(), peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
          if (approx.rows === 4) {
            let pts: Point[] = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] * 2, y: approx.data32S[j * 2 + 1] * 2 });
            const sum = [...pts].sort((a,b) => (a.x+a.y)-(b.x+b.y));
            const diff = [...pts].sort((a,b) => (a.y-a.x)-(b.y-b.x));
            const potential = { tl: sum[0], br: sum[3], tr: diff[0], bl: diff[3] };
            const ratio = Math.hypot(potential.tr.x-potential.tl.x, potential.tr.y-potential.tl.y) / Math.hypot(potential.bl.x-potential.tl.x, potential.bl.y-potential.tl.y);
            if (ratio > 0.6 && ratio < 0.8 && area > maxA) { maxA = area; found = potential; }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (found) { setTargetCorners(found); lastFoundTime.current = Date.now(); }
      else if (Date.now() - lastFoundTime.current > 500) setTargetCorners(null);

      src.delete(); gray.delete(); claheMat.delete(); clahe.delete(); blurred.delete(); thresh.delete(); edges.delete(); k.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {}
  }, [cvReady]);

  const triggerDeepScan = async () => {
    if (isDeepScanning || !videoRef.current || !cardCanvasRef.current || Date.now() - lastDeepScanTime.current < 5000) return;
    setIsDeepScanning(true);
    lastDeepScanTime.current = Date.now();
    try {
      const c = cardCanvasRef.current;
      const b64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
      const res = await identifyPokemonCard(b64);
      if (res && res.name) {
        onCardDetected({ ...res, id: Math.random().toString(36).substr(2,9), scanDate: new Date().toLocaleDateString(), imageUrl: c.toDataURL() });
        setScanResult({ name: res.name, price: res.marketValue || "--" });
        setTimeout(() => setScanResult(null), 2000);
      }
    } catch (e) {} finally { setIsDeepScanning(false); }
  };

  const processFrame = async () => {
    if (!targetCorners || !cvReady || !videoRef.current || !cardCanvasRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      let src = cv.imread(videoRef.current), dst = new cv.Mat(), dsize = new cv.Size(400, 560);
      let sc = cv.matFromArray(4, 1, cv.CV_32FC2, [targetCorners.tl.x, targetCorners.tl.y, targetCorners.tr.x, targetCorners.tr.y, targetCorners.br.x, targetCorners.br.y, targetCorners.bl.x, targetCorners.bl.y]);
      let dc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 400, 0, 400, 560, 0, 560]);
      let M = cv.getPerspectiveTransform(sc, dc);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      cv.imshow(cardCanvasRef.current, dst);
      
      const res = await extractNameLocally(cardCanvasRef.current);
      if (res) {
        setDetectedData(res);
        if (res.name && res.number) {
          onCardDetected({ id: Math.random().toString(36).substr(2,9), name: res.name, number: res.number, set: "Neural Scan", rarity: "Common", type: "Unknown", marketValue: "$--.--", scanDate: new Date().toLocaleDateString(), imageUrl: cardCanvasRef.current.toDataURL() });
          setScanResult({ name: res.name, price: "--" });
          setTimeout(() => setScanResult(null), 1500);
        }
      } else if (Date.now() - lastFoundTime.current > 1500) {
        triggerDeepScan();
      }
      src.delete(); dst.delete(); M.delete(); sc.delete(); dc.delete();
    } catch (e) {} finally { setIsProcessing(false); }
  };

  useEffect(() => {
    let int: number;
    if (isScanning && cvReady && !scanResult) {
      int = window.setInterval(() => { detectCardWithCV(); if (targetCorners) processFrame(); }, 100);
    }
    return () => clearInterval(int);
  }, [isScanning, cvReady, targetCorners, isProcessing, scanResult]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* Simplified Detection HUD */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-full px-8 py-4 shadow-2xl flex items-center gap-6 transition-all duration-300">
          <div className="flex items-center gap-4">
            <span className="text-xl font-orbitron font-black text-white uppercase tracking-tighter">
              {detectedData?.name || (isDeepScanning ? 'ANALYZING...' : '---')}
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

      {visualCorners && viewBox.w > 0 && !scanResult && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          <svg className="w-full h-full" viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice">
             <path d={`M ${visualCorners.tl.x} ${visualCorners.tl.y} L ${visualCorners.tr.x} ${visualCorners.tr.y} L ${visualCorners.br.x} ${visualCorners.br.y} L ${visualCorners.bl.x} ${visualCorners.bl.y} Z`} className={`fill-transparent stroke-[4px] transition-all duration-300 ${detectedData?.name ? 'stroke-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,1)]' : 'stroke-white/40'}`} />
             {[visualCorners.tl, visualCorners.tr, visualCorners.bl, visualCorners.br].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="8" className="fill-cyan-400 stroke-black stroke-2" />)}
          </svg>
        </div>
      )}

      {scanResult && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
           <div className="bg-slate-900/95 backdrop-blur-3xl border-4 border-cyan-500/50 p-16 rounded-[4rem] shadow-[0_0_150px_rgba(34,211,238,0.3)] animate-in zoom-in-95 duration-200 text-center relative overflow-hidden">
              <div className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6"><svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg></div>
              <div className="text-4xl font-orbitron font-black text-white mb-2 uppercase tracking-tighter">{scanResult.name}</div>
              <div className="bg-cyan-500/20 text-cyan-400 py-2 px-8 rounded-full border border-cyan-500/30 inline-block font-orbitron font-black uppercase text-[10px] tracking-widest">SECURED</div>
           </div>
        </div>
      )}

      {torchSupported && (
        <button onClick={toggleTorch} className={`absolute bottom-10 right-10 pointer-events-auto backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 ${isTorchOn ? 'bg-amber-400 text-white' : 'bg-slate-900/90 text-slate-400'}`}>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
