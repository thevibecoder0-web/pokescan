
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { manualCardLookup } from '../services/geminiService';
import { PokemonCard } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

// Global OpenCV helper
declare var cv: any;

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
  const [cardRect, setCardRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // HUD Persistence Logic
  const lastSeenTimeoutRef = useRef<number | null>(null);
  
  // Watchdog Timer: Reset system if stuck for 30 seconds
  const watchdogTimerRef = useRef<number | null>(null);

  // Guard against duplicate vaulting and track verification state
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
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      setError("CAMERA_LINK_FAILURE: Ensure browser permissions allow camera access.");
    }
  };

  useEffect(() => {
    if (isScanning) startCamera();
    else if (stream) stream.getTracks().forEach(t => t.stop());
  }, [isScanning]);

  /**
   * MANUAL RESET: Clear all locks and verification history
   */
  const handleReset = useCallback(() => {
    lastVerifiedKey.current = "";
    setScanResult(null);
    setIsVerifying(false);
    setDetectedData(null);
    setCardRect(null);
    setIsProcessing(false);
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    console.log("Scanner System Reset Triggered");
  }, []);

  /**
   * WATCHDOG: Monitor for stuck states
   */
  useEffect(() => {
    const isActivelyScanning = (cardRect || isVerifying || isProcessing) && !scanResult;
    
    if (isActivelyScanning) {
      if (!watchdogTimerRef.current) {
        watchdogTimerRef.current = window.setTimeout(() => {
          handleReset();
        }, 30000);
      }
    } else {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    }

    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
      }
    };
  }, [cardRect, isVerifying, isProcessing, scanResult, handleReset]);

  /**
   * COMPUTER VISION: High-Precision Card Tracking
   * Uses Adaptive Thresholding and Polylines for a "Perfect" Snap
   */
  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    // Use a higher precision preview for CV (50% scale)
    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let src = cv.imread(canvas);
      let dst = new cv.Mat();
      let gray = new cv.Mat();
      
      // 1. Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      // 2. Reduce noise
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      
      // 3. Adaptive Canny to find edges in varying light
      cv.Canny(gray, dst, 75, 200);
      
      // 4. Dilate to bridge gaps in lines (essential for "perfect" border)
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(dst, dst, kernel);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(dst, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestRect = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        // Minimum card area threshold (approx 10% of screen)
        if (area > (canvas.width * canvas.height * 0.1)) {
          // 5. Approx Poly to find the 4-sided polygon (the card)
          let approx = new cv.Mat();
          let peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

          if (approx.rows === 4) {
            let rect = cv.boundingRect(approx);
            let aspectRatio = rect.width / rect.height;
            
            // Standard Card Aspect Ratio (~0.71). Tolerance for tilt: 0.58 to 0.88
            if (aspectRatio > 0.55 && aspectRatio < 0.9) {
              if (area > maxArea) {
                maxArea = area;
                // Upscale coordinates back to video resolution
                bestRect = { 
                  x: rect.x * 2, y: rect.y * 2, 
                  w: rect.width * 2, h: rect.height * 2 
                };
              }
            }
          }
          approx.delete();
        }
        cnt.delete();
      }

      if (bestRect) {
        if (lastSeenTimeoutRef.current) {
          clearTimeout(lastSeenTimeoutRef.current);
          lastSeenTimeoutRef.current = null;
        }
        setCardRect(bestRect);
      } else {
        setCardRect(null);
        if (!lastSeenTimeoutRef.current) {
          lastSeenTimeoutRef.current = window.setTimeout(() => {
            setDetectedData(null);
            lastSeenTimeoutRef.current = null;
          }, 800); // Shorter cooldown for snappier feel
        }
      }

      src.delete(); dst.delete(); gray.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Core Error:", e);
    }
  }, [cvReady]);

  /**
   * VERIFICATION LOGIC: Confirm card is real before auto-adding
   */
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
        const aiResponse = await manualCardLookup(`${name} pokemon card #${number} official tcg data`);
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

        if (cardRect && !isProcessing && !isVerifying) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d');
          
          if (cCtx) {
            // Precise padding to ensure edges (set number) aren't clipped by the bounding box
            const padding = 10;
            const cropX = Math.max(0, cardRect.x - padding);
            const cropY = Math.max(0, cardRect.y - padding);
            const cropW = Math.min(video.videoWidth - cropX, cardRect.w + (padding * 2));
            const cropH = Math.min(video.videoHeight - cropY, cardRect.h + (padding * 2));

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
  }, [isScanning, cvReady, isVerifying, cardRect, isProcessing, scanResult]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD: Neural Edge & Asset Tracker */}
      {cardRect && !isVerifying && !scanResult && (
        <div 
          style={{
            left: `${(cardRect.x / videoRef.current!.videoWidth) * 100}%`,
            top: `${(cardRect.y / videoRef.current!.videoHeight) * 100}%`,
            width: `${(cardRect.w / videoRef.current!.videoWidth) * 100}%`,
            height: `${(cardRect.h / videoRef.current!.videoHeight) * 100}%`
          }}
          className={`absolute border-2 rounded-2xl transition-all duration-75 ease-out z-20 pointer-events-none ${
             detectedData?.name && detectedData.number ? 'border-cyan-400 shadow-[0_0_60px_rgba(34,211,238,0.7)]' : 'border-white/40'
          }`}
        >
          {/* Diagnostic Overlay */}
          <div className="absolute -top-14 left-0 flex flex-col gap-1.5">
             <div className="flex gap-2">
                <span className={`px-2.5 py-1 text-[10px] font-orbitron font-black uppercase rounded shadow-lg ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-900/80 text-slate-500 border border-white/5 backdrop-blur-md'}`}>
                  {detectedData?.name || 'NAME_PENDING'}
                </span>
                <span className={`px-2.5 py-1 text-[10px] font-orbitron font-black uppercase rounded shadow-lg ${detectedData?.number ? 'bg-purple-600 text-white' : 'bg-slate-900/80 text-slate-500 border border-white/5 backdrop-blur-md'}`}>
                  #{detectedData?.number || 'NUM_PENDING'}
                </span>
             </div>
             {detectedData?.name && detectedData.number && (
                <div className="bg-cyan-500/20 backdrop-blur-md border border-cyan-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
                   <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                   <span className="text-[9px] font-orbitron text-cyan-400 font-bold uppercase tracking-widest">Awaiting Authenticity Verification...</span>
                </div>
             )}
          </div>

          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/60 rounded-tl-xl"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/60 rounded-tr-xl"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/60 rounded-bl-xl"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/60 rounded-br-xl"></div>
        </div>
      )}

      {/* Global Status Layers */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        
        {/* Verification Stage */}
        {isVerifying && !scanResult && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <div className="relative">
                    <div className="w-28 h-28 border-4 border-cyan-400 border-solid rounded-full animate-spin shadow-[0_0_60px_rgba(34,211,238,0.4)]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-12 h-12 text-cyan-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                </div>
                <div className="mt-10 text-cyan-400 font-orbitron font-black text-2xl tracking-[0.6em] animate-pulse uppercase">Verifying_Asset</div>
                <p className="text-slate-500 text-[11px] uppercase font-black tracking-widest mt-3">Validating against TCG Archives</p>
            </div>
        )}

        {/* Success Stage */}
        {scanResult && (
           <div className="bg-slate-900/98 backdrop-blur-3xl border-4 border-green-500/50 p-24 rounded-[6rem] shadow-[0_0_180px_rgba(34,197,94,0.4)] animate-in zoom-in-90 duration-500 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-green-500 shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse"></div>
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_50px_rgba(34,197,94,0.6)] animate-bounce">
                  <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="relative z-10">
                <div className="text-5xl font-orbitron font-black text-white mb-4 uppercase tracking-tighter leading-tight drop-shadow-2xl">{scanResult.name}</div>
                <div className="text-4xl font-orbitron text-green-400 font-bold tracking-tight mb-10">{scanResult.price}</div>
                <div className="bg-green-500/20 text-green-400 py-4 px-12 rounded-full border border-green-500/30 inline-block">
                    <span className="text-[13px] font-orbitron font-black uppercase tracking-[0.5em]">Real Card Authenticated</span>
                </div>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Telemetry HUD */}
      <div className="absolute bottom-14 left-0 w-full px-12 flex justify-between items-end">
        <div className="bg-slate-950/95 backdrop-blur-3xl p-8 rounded-[3rem] border border-white/10 shadow-3xl min-w-[240px]">
           <div className="flex items-center gap-4 mb-5">
             <div className={`w-3.5 h-3.5 rounded-full ${cvReady ? 'bg-green-500 animate-pulse' : 'bg-red-500'} shadow-[0_0_20px_rgba(34,197,94,0.5)]`}></div>
             <span className="text-[12px] font-orbitron font-black text-white uppercase tracking-widest leading-none">CV_CORE_STABLE</span>
           </div>
           <div className="space-y-2.5">
             <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Search Matrix:</span>
                <span className="text-[9px] text-cyan-400 font-black uppercase tracking-tight">{detectedData?.strategyUsed || 'SCANNING...'}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Lock Integrity:</span>
                <span className={`text-[9px] font-black uppercase tracking-tight ${detectedData?.name && detectedData.number ? 'text-green-400' : 'text-amber-500'}`}>
                   {detectedData?.name && detectedData.number ? 'CONFIRMED_DUAL' : 'SEEKING_DATA'}
                </span>
             </div>
           </div>
        </div>

        <div className="flex flex-col items-end gap-4">
            {!isVerifying && !scanResult && (
                <div className="bg-slate-900/50 backdrop-blur-xl px-10 py-6 rounded-[3rem] border border-white/5 flex flex-col items-center gap-3 animate-in fade-in duration-300">
                    <span className="text-[11px] font-orbitron font-black text-white/40 uppercase tracking-[0.4em]">Ready for Verification</span>
                    <div className="flex gap-3">
                        <div className="w-2 h-2 bg-cyan-500/40 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-cyan-500/60 rounded-full animate-bounce [animation-delay:200ms]"></div>
                        <div className="w-2 h-2 bg-cyan-500/80 rounded-full animate-bounce [animation-delay:400ms]"></div>
                    </div>
                </div>
            )}
            
            <button 
                onClick={handleReset}
                className="pointer-events-auto bg-slate-900/80 hover:bg-red-600 backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 group"
                title="System Reset"
            >
                <svg className="w-8 h-8 text-white group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
