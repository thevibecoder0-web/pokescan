
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
  
  // Adaptive Exposure State
  const [exposureBias, setExposureBias] = useState(0);
  const lastAdjustmentTime = useRef<number>(0);

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

  const adjustExposureForGlare = useCallback(async (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!stream || !isTorchOn || Date.now() - lastAdjustmentTime.current < 500) return;

    const track = stream.getVideoTracks()[0];
    const capabilities = (track as any).getCapabilities?.() || {};
    if (!capabilities.exposureCompensation) return;

    const imageData = ctx.getImageData(0, 0, width, height).data;
    let blownOutPixels = 0;
    let totalLuminance = 0;
    const step = 8; 
    
    for (let i = 0; i < imageData.length; i += 4 * step) {
      const r = imageData[i];
      const g = imageData[i+1];
      const b = imageData[i+2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      totalLuminance += lum;
      if (lum > 235) blownOutPixels++;
    }

    const totalSamples = imageData.length / (4 * step);
    const glareRatio = blownOutPixels / totalSamples;
    const avgLuminance = totalLuminance / totalSamples;

    let targetBias = exposureBias;
    const stepSize = 0.5;

    if (glareRatio > 0.05) {
      targetBias = Math.max(capabilities.exposureCompensation.min || -2.0, exposureBias - stepSize);
    } else if (avgLuminance < 80 && glareRatio < 0.01) {
      targetBias = Math.min(capabilities.exposureCompensation.max || 2.0, exposureBias + stepSize);
    }

    if (targetBias !== exposureBias) {
      try {
        await track.applyConstraints({
          advanced: [{ exposureCompensation: targetBias }]
        } as any);
        setExposureBias(targetBias);
        lastAdjustmentTime.current = Date.now();
      } catch (e) {
        console.warn("Neural Exposure Correction Failed");
      }
    }
  }, [stream, isTorchOn, exposureBias]);

  const toggleTorch = async () => {
    if (!stream || !torchSupported) return;
    const track = stream.getVideoTracks()[0];
    const capabilities = (track as any).getCapabilities?.() || {};
    
    try {
      const newTorchState = !isTorchOn;
      const advancedConstraints: any = { torch: newTorchState };
      
      if (!newTorchState) {
        advancedConstraints.exposureCompensation = 0;
        setExposureBias(0);
      }

      await track.applyConstraints({ advanced: [advancedConstraints] } as any);
      setIsTorchOn(newTorchState);
    } catch (e) {
      console.error("Neural Light Control Failure:", e);
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

    if (isTorchOn) {
      adjustExposureForGlare(context, canvas.width, canvas.height);
    }

    try {
      let src = cv.imread(canvas);
      let gray = new cv.Mat();
      let blurred = new cv.Mat();
      let thresh = new cv.Mat();
      let cannyEdges = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
      cv.Canny(blurred, cannyEdges, 75, 200);
      cv.bitwise_or(thresh, cannyEdges, thresh);
      
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let foundCorners: CardCorners | null = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        if (area > (canvas.width * canvas.height * 0.05)) {
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

            if (ratio > 0.5 && ratio < 1.0) {
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

      src.delete(); gray.delete(); blurred.delete(); thresh.delete(); cannyEdges.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Failure");
    }
  }, [cvReady, isTorchOn, adjustExposureForGlare]);

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

  const processNeuralCrop = async () => {
    if (!targetCorners || !cvReady || !videoRef.current || !cardCanvasRef.current) return;

    setIsProcessing(true);
    const video = videoRef.current;
    
    try {
      let src = cv.imread(video);
      let dst = new cv.Mat();
      let dsize = new cv.Size(400, 560);

      let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
        targetCorners.tl.x, targetCorners.tl.y,
        targetCorners.tr.x, targetCorners.tr.y,
        targetCorners.br.x, targetCorners.br.y,
        targetCorners.bl.x, targetCorners.bl.y
      ]);

      let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        400, 0,
        400, 560,
        0, 560
      ]);

      let M = cv.getPerspectiveTransform(srcCoords, dstCoords);
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

      cv.imshow(cardCanvasRef.current, dst);

      const result = await extractNameLocally(cardCanvasRef.current);
      if (result) {
        setDetectedData(result);
        if (result.name && result.number) {
          instantVault(result);
        }
      }

      src.delete(); dst.delete(); M.delete(); srcCoords.delete(); dstCoords.delete();
    } catch (e) {
      console.warn("Neural Warp Failure");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !scanResult) {
      interval = window.setInterval(async () => {
        detectCardWithCV();
        if (targetCorners && !isProcessing) {
          processNeuralCrop();
        }
      }, 100); 
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, targetCorners, isProcessing, scanResult]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* Neural Status Hub (New 50% Transparent Overlay) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg z-50">
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-1 transition-all duration-500 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-3 w-full">
            <div className={`w-2 h-2 rounded-full animate-pulse ${detectedData?.name ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-orbitron font-black text-slate-400 uppercase tracking-[0.3em]">Neural_Feeds_Status:</span>
            <span className={`text-[10px] font-orbitron font-black uppercase ${detectedData?.name ? 'text-cyan-400' : 'text-slate-500 animate-pulse'}`}>
              {detectedData?.name ? 'IDENTIFIED' : 'SCANNING_ENVIRONMENT...'}
            </span>
          </div>
          
          <div className="w-full h-px bg-white/5 my-1" />
          
          <div className="flex justify-between items-center w-full px-1">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Target_ID</span>
              <span className="text-sm font-orbitron font-bold text-white uppercase truncate max-w-[200px]">
                {detectedData?.name || '---'}
              </span>
            </div>
            <div className="text-right flex flex-col">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Asset_Num</span>
              <span className="text-sm font-orbitron font-bold text-cyan-400">
                {detectedData?.number ? `#${detectedData.number}` : '---'}
              </span>
            </div>
          </div>
        </div>
      </div>

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

      {torchSupported && (
        <div className="absolute bottom-10 right-10 flex flex-col gap-4">
          <button 
              onClick={toggleTorch}
              className={`pointer-events-auto backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 group relative ${isTorchOn ? 'bg-amber-400 text-white' : 'bg-slate-900/90 text-slate-400'}`}
              title={isTorchOn ? "Neural Light: ACTIVE (Adaptive Exposure)" : "Neural Light: OFF"}
          >
              <svg className={`w-8 h-8 transition-transform ${isTorchOn ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  {!isTorchOn && (
                    <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2.5" />
                  )}
              </svg>
              {isTorchOn && (
                <div className="absolute -top-3 -right-3 px-2 py-1 bg-cyan-400 rounded-lg shadow-xl border-2 border-slate-900 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-pulse" />
                    <span className="text-[8px] font-black text-slate-900 uppercase">EV {exposureBias > 0 ? `+${exposureBias.toFixed(1)}` : exposureBias.toFixed(1)}</span>
                </div>
              )}
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
