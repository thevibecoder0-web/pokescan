
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
   * COMPUTER VISION: Locate Card via Edge & Color Contrast
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
      
      cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(dst, dst, new cv.Size(5, 5), 0);
      cv.Canny(dst, dst, 50, 150);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestRect = null;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > 5000) {
          let rect = cv.boundingRect(cnt);
          let aspectRatio = rect.width / rect.height;
          // Standard Card Aspect Ratio (~0.71)
          if (aspectRatio > 0.6 && aspectRatio < 0.85) {
            if (area > maxArea) {
              maxArea = area;
              bestRect = { 
                x: rect.x * 2, y: rect.y * 2, 
                w: rect.width * 2, h: rect.height * 2 
              };
            }
          }
        }
        cnt.delete();
      }

      setCardRect(bestRect);
      src.delete(); dst.delete(); contours.delete(); hierarchy.delete();
    } catch (e) {
      console.warn("CV Frame Processing Error - Skipping Frame");
    }
  }, [cvReady]);

  /**
   * VERIFICATION LOGIC: Confirm card is real before auto-adding
   */
  const verifyAndVault = async (data: OCRResult) => {
    if (isVerifying || !data.name || !data.number) return;
    
    const verificationKey = `${data.name}-${data.number}`.toLowerCase();
    // Don't re-verify the same card in one session unless it leaves view
    if (lastVerifiedKey.current === verificationKey) return;
    
    setIsVerifying(true);
    const { name, number } = data;
    
    // Step 1: Check Local Hardcoded Registry (Instant Validation)
    let match = SURGING_SPARKS_DATA.find(c => 
      c.name.toLowerCase() === name.toLowerCase() && 
      c.number.includes(number)
    );

    try {
      // Step 2: Global Database Sync via AI Grounding
      if (!match) {
        const aiResponse = await manualCardLookup(`${name} pokemon card #${number} official tcg data`);
        // If AI confirms this is a real card with a valid set name
        if (aiResponse && aiResponse.name && aiResponse.set && aiResponse.set !== "Unknown Set") {
          match = aiResponse as any;
        }
      }

      // Final Strict "Real Card" check
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
        
        // Success Cooldown
        setTimeout(() => {
          setScanResult(null);
          setIsVerifying(false);
        }, 3500);
      } else {
        // If the card isn't "real" or found, reset and keep scanning
        console.log("Card Verification Failed - Continuing Search...");
        setIsVerifying(false);
      }
    } catch (e) {
      console.error("Verification Circuit Fault - Resetting Scan");
      setIsVerifying(false);
    }
  };

  // Continuous Neural Loop
  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !isVerifying) {
      interval = window.setInterval(async () => {
        detectCardWithCV();

        if (cardRect && !isProcessing && !isVerifying) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d');
          
          if (cCtx) {
            // Adjust crop size to match detected card dimensions
            cardCanvas.width = cardRect.w;
            cardCanvas.height = cardRect.h;
            cCtx.drawImage(video, cardRect.x, cardRect.y, cardRect.w, cardRect.h, 0, 0, cardRect.w, cardRect.h);
            
            const result = await extractNameLocally(cardCanvas);
            setDetectedData(result);
            
            // STRICT AUTO-ADD: Requires Dual-Lock (Name + Number)
            if (result && result.name && result.number) {
              verifyAndVault(result);
            }
          }
          setIsProcessing(false);
        } else if (!cardRect) {
          setDetectedData(null);
          // If card leaves view, reset the last verified key so it can be scanned again if brought back
          lastVerifiedKey.current = "";
        }
      }, 400);
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, isVerifying, cardRect, isProcessing]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD: Neural Edge & Asset Tracker */}
      {cardRect && !isVerifying && (
        <div 
          style={{
            left: `${(cardRect.x / videoRef.current!.videoWidth) * 100}%`,
            top: `${(cardRect.y / videoRef.current!.videoHeight) * 100}%`,
            width: `${(cardRect.w / videoRef.current!.videoWidth) * 100}%`,
            height: `${(cardRect.h / videoRef.current!.videoHeight) * 100}%`
          }}
          className={`absolute border-2 rounded-2xl transition-all duration-150 ease-out z-20 pointer-events-none ${
             detectedData?.name && detectedData.number ? 'border-cyan-400 shadow-[0_0_60px_rgba(34,211,238,0.7)]' : 'border-white/20'
          }`}
        >
          {/* Diagnostic Overlay */}
          <div className="absolute -top-14 left-0 flex flex-col gap-1.5">
             <div className="flex gap-2">
                <span className={`px-2.5 py-1 text-[10px] font-orbitron font-black uppercase rounded shadow-lg ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-900 text-slate-500 border border-white/5'}`}>
                  {detectedData?.name || 'NAME_PENDING'}
                </span>
                <span className={`px-2.5 py-1 text-[10px] font-orbitron font-black uppercase rounded shadow-lg ${detectedData?.number ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-500 border border-white/5'}`}>
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

          <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white/30 rounded-tl-xl"></div>
          <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white/30 rounded-tr-xl"></div>
          <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white/30 rounded-bl-xl"></div>
          <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white/30 rounded-br-xl"></div>
        </div>
      )}

      {/* Verification / Success Modals */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        {isVerifying && !scanResult && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                <div className="relative">
                    <div className="w-28 h-28 border-4 border-cyan-400 border-solid rounded-full animate-spin shadow-[0_0_60px_rgba(34,211,238,0.4)]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-12 h-12 text-cyan-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                </div>
                <div className="mt-10 text-cyan-400 font-orbitron font-black text-2xl tracking-[0.6em] animate-pulse">VERIFYING_ASSET</div>
                <p className="text-slate-500 text-[11px] uppercase font-black tracking-widest mt-3">Validating against TCG Archives</p>
            </div>
        )}

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

        {!cardRect && !isVerifying && !scanResult && (
          <div className="bg-slate-950/90 backdrop-blur-3xl border border-white/5 px-14 py-12 rounded-[5rem] text-center shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-16 duration-1000">
             <div className="relative w-16 h-16 mx-auto mb-10">
                <div className="absolute inset-0 border-4 border-white/5 border-t-cyan-500 rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-2 border-white/5 border-b-purple-500 rounded-full animate-spin-slow"></div>
             </div>
             <p className="text-white font-orbitron font-bold text-lg uppercase tracking-[0.5em] mb-4">Neural Scanner Active</p>
             <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] max-w-[280px] mx-auto leading-relaxed">Position a Pokémon Card in the scan zone. Requires clear Name and Set Number visibility for authenticity verification.</p>
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

        {!isVerifying && !scanResult && (
            <div className="bg-slate-900/50 backdrop-blur-xl px-10 py-6 rounded-[3rem] border border-white/5 flex flex-col items-center gap-3">
                <span className="text-[11px] font-orbitron font-black text-white/40 uppercase tracking-[0.4em]">Ready for Verification</span>
                <div className="flex gap-3">
                    <div className="w-2 h-2 bg-cyan-500/40 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-cyan-500/60 rounded-full animate-bounce [animation-delay:200ms]"></div>
                    <div className="w-2 h-2 bg-cyan-500/80 rounded-full animate-bounce [animation-delay:400ms]"></div>
                </div>
            </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
