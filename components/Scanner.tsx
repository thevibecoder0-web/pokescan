
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
  }, []);

  useEffect(() => {
    const isActivelyScanning = (cardRect || isVerifying || isProcessing) && !scanResult;
    if (isActivelyScanning && !watchdogTimerRef.current) {
      watchdogTimerRef.current = window.setTimeout(() => handleReset(), 30000);
    } else if (!isActivelyScanning && watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    return () => { if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current); };
  }, [cardRect, isVerifying, isProcessing, scanResult, handleReset]);

  /**
   * COMPUTER VISION: Refined for TCG Standard 63x88mm Dimensions
   */
  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return;
    
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
      let bestRect = null;

      const OFFICIAL_RATIO = 63 / 88; // ~0.7159

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        
        if (area > (canvas.width * canvas.height * 0.08)) {
          let approx = new cv.Mat();
          let peri = cv.arcLength(cnt, true);
          cv.approxPolyDP(cnt, approx, 0.025 * peri, true);

          // Standard cards are rectangles (4 vertices)
          if (approx.rows === 4) {
            let rect = cv.boundingRect(approx);
            let aspectRatio = rect.width / rect.height;
            
            // Allow for perspective tilt around the 0.716 ratio
            if (aspectRatio > 0.60 && aspectRatio < 0.80) {
              if (area > maxArea) {
                maxArea = area;
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
          }, 600);
        }
      }

      src.delete(); dst.delete(); gray.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Lock Error:", e);
    }
  }, [cvReady]);

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
        const aiResponse = await manualCardLookup(`${name} pokemon card #${number} tcgplayer market price`);
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
            // Generous padding (15px) to ensure the 'tall' aspect doesn't clip important footer data
            const padding = 15;
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
      
      {/* TCG-SPECIFIC BORDER HUD (63x88 Ratio Locked) */}
      {cardRect && !isVerifying && !scanResult && (
        <div 
          style={{
            left: `${(cardRect.x / videoRef.current!.videoWidth) * 100}%`,
            top: `${(cardRect.y / videoRef.current!.videoHeight) * 100}%`,
            width: `${(cardRect.w / videoRef.current!.videoWidth) * 100}%`,
            height: `${(cardRect.h / videoRef.current!.videoHeight) * 100}%`
          }}
          className={`absolute border-2 rounded-2xl transition-all duration-100 ease-out z-20 pointer-events-none ${
             detectedData?.name && detectedData.number ? 'border-cyan-400 shadow-[0_0_80px_rgba(34,211,238,0.5)]' : 'border-white/50'
          }`}
        >
          {/* Asset Info Flyout */}
          <div className="absolute -top-16 left-0 flex flex-col gap-2 scale-90 sm:scale-100 origin-bottom-left">
             <div className="flex gap-2">
                <span className={`px-3 py-1.5 text-[11px] font-orbitron font-black uppercase rounded shadow-2xl backdrop-blur-md ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-900/90 text-slate-500 border border-white/10'}`}>
                  {detectedData?.name || 'SEARCHING_NAME...'}
                </span>
                <span className={`px-3 py-1.5 text-[11px] font-orbitron font-black uppercase rounded shadow-2xl backdrop-blur-md ${detectedData?.number ? 'bg-purple-600 text-white' : 'bg-slate-900/90 text-slate-500 border border-white/10'}`}>
                  #{detectedData?.number || 'SEARCHING_ID...'}
                </span>
             </div>
             {detectedData?.name && detectedData.number && (
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2 animate-in slide-in-from-left-4">
                   <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                   <span className="text-[9px] font-orbitron text-cyan-400 font-bold uppercase tracking-widest">Target Authenticated_</span>
                </div>
             )}
          </div>

          {/* Precision Corners (Reflecting 88x63mm Shape) */}
          <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-xl shadow-white/20 shadow-sm"></div>
          <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-xl shadow-white/20 shadow-sm"></div>
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-xl shadow-white/20 shadow-sm"></div>
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-xl shadow-white/20 shadow-sm"></div>
        </div>
      )}

      {/* Verification Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        {isVerifying && !scanResult && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <div className="relative">
                    <div className="w-32 h-32 border-4 border-cyan-400 border-solid border-t-transparent rounded-full animate-spin shadow-[0_0_80px_rgba(34,211,238,0.3)]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-14 h-14 text-cyan-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                </div>
                <div className="mt-12 text-cyan-400 font-orbitron font-black text-2xl tracking-[0.6em] animate-pulse uppercase">Syncing_TCG_Cloud</div>
                <p className="text-slate-500 text-[11px] uppercase font-black tracking-widest mt-4">Cross-referencing high-fidelity visual data</p>
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
                    <span className="text-[12px] font-orbitron font-black uppercase tracking-[0.4em]">Vaulted Successfully</span>
                </div>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Telemetry HUD */}
      <div className="absolute bottom-10 left-0 w-full px-10 flex justify-between items-end">
        <div className="bg-slate-950/90 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/10 shadow-3xl min-w-[220px]">
           <div className="flex items-center gap-4 mb-4">
             <div className={`w-3 h-3 rounded-full ${cvReady ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
             <span className="text-[11px] font-orbitron font-black text-white uppercase tracking-widest">Neural_Core_v4.2</span>
           </div>
           <div className="space-y-2">
             <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Matrix:</span>
                <span className="text-[8px] text-cyan-400 font-black uppercase tracking-tight">{detectedData?.strategyUsed || 'IDLE_SCAN'}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Ratio Lock:</span>
                <span className={`text-[8px] font-black uppercase tracking-tight ${cardRect ? 'text-green-400' : 'text-slate-600'}`}>
                   {cardRect ? '88x63mm_SNAP' : 'SEEKING_BOUNDS'}
                </span>
             </div>
           </div>
        </div>

        <button 
            onClick={handleReset}
            className="pointer-events-auto bg-slate-900/90 hover:bg-red-600 backdrop-blur-xl p-6 rounded-full border border-white/10 shadow-2xl transition-all active:scale-90 group"
            title="Force System Reset"
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
