
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
  const [loading, setLoading] = useState(false);
  const [detectedData, setDetectedData] = useState<OCRResult | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [cardRect, setCardRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Guard against duplicate vaulting
  const lastVaultedRef = useRef<string>("");

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
      setError("CAMERA_LINK_FAILURE: Permissions missing.");
    }
  };

  useEffect(() => {
    if (isScanning) startCamera();
    else if (stream) stream.getTracks().forEach(t => t.stop());
  }, [isScanning]);

  /**
   * COMPUTER VISION: Find Card via Color Contrast
   */
  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    // Work at half res for better mobile performance
    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let src = cv.imread(canvas);
      let dst = new cv.Mat();
      
      // Color difference/Edge detection pipeline
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
        if (area > 5000) { // Reject small shapes
          let rect = cv.boundingRect(cnt);
          let aspectRatio = rect.width / rect.height;
          // Target 2.5 x 3.5 ratio (~0.71)
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
      console.warn("CV Frame Process Skip");
    }
  }, [cvReady]);

  /**
   * AUTO-VAULT: Triggered ONLY on Dual-Lock (Name + Number)
   */
  const autoVaultCard = async (data: OCRResult) => {
    if (loading || !data.name || !data.number) return;
    
    const vaultKey = `${data.name}-${data.number}`;
    if (lastVaultedRef.current === vaultKey) return;
    
    setLoading(true);
    const { name, number } = data;
    
    // Check Preloaded Registry (Surging Sparks)
    let match = SURGING_SPARKS_DATA.find(c => 
      c.name.toLowerCase() === name.toLowerCase() && 
      c.number.includes(number)
    );

    try {
      if (!match) {
        // AI SYNC: Fetch official data + market value if not in local DB
        const aiMatch = await manualCardLookup(`${name} card #${number} pokemon official tcgplayer`);
        if (aiMatch) match = aiMatch as any;
      }

      const finalCard: PokemonCard = {
        id: Math.random().toString(36).substring(7),
        name: match?.name || name,
        number: match?.number || number,
        set: match?.set || 'Found via Neural Scan',
        rarity: match?.rarity || 'Common',
        type: match?.type || 'Unknown',
        marketValue: match?.marketValue || '$--.--',
        imageUrl: match?.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${name}+${number}`,
        scanDate: new Date().toLocaleDateString()
      };

      lastVaultedRef.current = vaultKey;
      setScanResult({ name: finalCard.name, price: finalCard.marketValue || '$??' });
      onCardDetected(finalCard);
      
      setTimeout(() => {
        setScanResult(null);
        setLoading(false);
      }, 3000); // 3s cooldown for visual confirmation
    } catch (e) {
      setError("VAULT_ERROR: Identification failed.");
      setTimeout(() => { setError(null); setLoading(false); }, 2000);
    }
  };

  // Processing Loop
  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !loading) {
      interval = window.setInterval(async () => {
        detectCardWithCV();

        if (cardRect && !isProcessing && !loading) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d');
          
          if (cCtx) {
            // Adaptive scan zone: size matches the card dimensions
            cardCanvas.width = cardRect.w;
            cardCanvas.height = cardRect.h;
            cCtx.drawImage(video, cardRect.x, cardRect.y, cardRect.w, cardRect.h, 0, 0, cardRect.w, cardRect.h);
            
            const result = await extractNameLocally(cardCanvas);
            setDetectedData(result);
            
            // STRICT AUTO-ADD: ONLY if Name AND Number are found
            if (result && result.name && result.number) {
              autoVaultCard(result);
            }
          }
          setIsProcessing(false);
        } else if (!cardRect) {
          setDetectedData(null); // Clear locks if card is lost
        }
      }, 400); // Efficient polling
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, loading, cardRect, isProcessing]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD: Neural Edge Tracker */}
      {cardRect && !loading && (
        <div 
          style={{
            left: `${(cardRect.x / videoRef.current!.videoWidth) * 100}%`,
            top: `${(cardRect.y / videoRef.current!.videoHeight) * 100}%`,
            width: `${(cardRect.w / videoRef.current!.videoWidth) * 100}%`,
            height: `${(cardRect.h / videoRef.current!.videoHeight) * 100}%`
          }}
          className={`absolute border-2 rounded-xl transition-all duration-150 ease-out z-20 pointer-events-none ${
             detectedData?.name && detectedData.number ? 'border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.7)]' : 'border-white/20'
          }`}
        >
          {/* Status Indicators */}
          <div className="absolute -top-12 left-0 flex flex-col gap-1">
             <div className="flex gap-1">
                <span className={`px-2 py-0.5 text-[9px] font-orbitron font-black uppercase ${detectedData?.name ? 'bg-cyan-400 text-black' : 'bg-slate-800 text-slate-500'}`}>
                  NAME: {detectedData?.name || 'SEARCHING...'}
                </span>
                <span className={`px-2 py-0.5 text-[9px] font-orbitron font-black uppercase ${detectedData?.number ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  NUM: {detectedData?.number || 'SEARCHING...'}
                </span>
             </div>
             {detectedData?.name && detectedData.number && (
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md">
                   <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                   <span className="text-[8px] font-orbitron text-cyan-400 font-black tracking-widest uppercase">Dual_Lock: Syncing_Vault...</span>
                </div>
             )}
          </div>

          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/40"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/40"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/40"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/40"></div>
        </div>
      )}

      {/* Global State HUD */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
        {loading && !scanResult && (
            <div className="flex flex-col items-center animate-in fade-in duration-300">
                <div className="w-24 h-24 border-t-4 border-cyan-400 border-solid rounded-full animate-spin shadow-[0_0_50px_rgba(34,211,238,0.3)]"></div>
                <div className="mt-8 text-cyan-400 font-orbitron font-black text-2xl tracking-[0.5em] animate-pulse">VAULT_LOCKING</div>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-2">Initializing Blockchain Record</p>
            </div>
        )}

        {scanResult && (
           <div className="bg-slate-900/95 backdrop-blur-3xl border-4 border-green-500/50 p-20 rounded-[5rem] shadow-[0_0_150px_rgba(34,197,94,0.3)] animate-in zoom-in-95 duration-500 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent"></div>
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-10 shadow-[0_0_40px_rgba(34,197,94,0.6)] animate-bounce">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <div className="relative z-10">
                <div className="text-5xl font-orbitron font-black text-white mb-3 uppercase tracking-tighter leading-none">{scanResult.name}</div>
                <div className="text-4xl font-orbitron text-green-400 font-bold tracking-tight">{scanResult.price}</div>
                <div className="mt-10 text-[12px] text-green-400 uppercase font-black tracking-[0.6em] bg-green-500/10 py-3 px-10 rounded-full inline-block border border-green-500/30">Vault Synchronized</div>
              </div>
           </div>
        )}

        {!cardRect && !loading && !scanResult && (
          <div className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 px-12 py-10 rounded-[4rem] text-center shadow-2xl animate-in slide-in-from-bottom-12 duration-700">
             <div className="w-12 h-12 border-4 border-white/10 border-t-cyan-500 rounded-full animate-spin mx-auto mb-8"></div>
             <p className="text-white font-orbitron font-bold text-sm uppercase tracking-[0.4em]">Initialize Dual_Lock</p>
             <p className="text-slate-500 text-[9px] uppercase tracking-widest mt-4 max-w-[220px] mx-auto leading-relaxed">Ensure edges are visible for color-difference localization</p>
          </div>
        )}
      </div>

      {/* Bottom Status Panel */}
      <div className="absolute bottom-12 left-0 w-full px-10 flex justify-between items-end">
        <div className="bg-slate-950/90 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl min-w-[200px]">
           <div className="flex items-center gap-4 mb-3">
             <div className={`w-3 h-3 rounded-full ${cvReady ? 'bg-green-500 animate-pulse' : 'bg-red-500'} shadow-[0_0_15px_rgba(34,197,94,0.4)]`}></div>
             <span className="text-[11px] font-orbitron font-black text-white uppercase tracking-widest">Neural_Core</span>
           </div>
           <div className="space-y-1.5">
             <div className="flex justify-between">
                <span className="text-[8px] text-slate-600 uppercase font-black">Strategy:</span>
                <span className="text-[8px] text-cyan-500 font-black uppercase tracking-tighter">{detectedData?.strategyUsed || 'IDLE'}</span>
             </div>
             <div className="flex justify-between">
                <span className="text-[8px] text-slate-600 uppercase font-black">Lock Status:</span>
                <span className={`text-[8px] font-black uppercase ${detectedData?.name && detectedData.number ? 'text-green-400' : 'text-amber-500'}`}>
                   {detectedData?.name && detectedData.number ? 'DUAL_ACQUIRED' : (detectedData?.name || detectedData?.number ? 'PARTIAL_SYNC' : 'SEEKING')}
                </span>
             </div>
           </div>
        </div>

        {!loading && !scanResult && (
            <div className="bg-white/5 backdrop-blur-md px-8 py-5 rounded-[2rem] border border-white/10 flex flex-col items-center">
                <span className="text-[10px] font-orbitron font-black text-white/50 uppercase tracking-[0.3em]">AUTO_ADD: ACTIVE</span>
                <div className="flex gap-2 mt-3">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:0ms]"></div>
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:200ms]"></div>
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:400ms]"></div>
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
