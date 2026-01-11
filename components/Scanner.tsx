
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

  // Initialize OpenCV check
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
      setError("CAMERA_FAILED: Ensure permissions are granted.");
    }
  };

  useEffect(() => {
    if (isScanning) startCamera();
    else if (stream) stream.getTracks().forEach(t => t.stop());
  }, [isScanning]);

  /**
   * COMPUTER VISION: Card Boundary Detection
   * Detects the card by looking for the largest rectangular contour with high color contrast.
   */
  const detectCardWithCV = useCallback(() => {
    if (!cvReady || !videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    canvas.width = video.videoWidth / 2; // Process at lower res for performance
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
          // Standard Pokemon card is ~0.7 (2.5/3.5)
          if (aspectRatio > 0.5 && aspectRatio < 0.9) {
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
      console.warn("CV Frame Error");
    }
  }, [cvReady]);

  // Main Processing Loop
  useEffect(() => {
    let interval: number;
    if (isScanning && cvReady && !loading) {
      interval = window.setInterval(async () => {
        detectCardWithCV();

        if (cardRect && !isProcessing) {
          setIsProcessing(true);
          const video = videoRef.current!;
          const cardCanvas = cardCanvasRef.current!;
          const cCtx = cardCanvas.getContext('2d');
          
          if (cCtx) {
            // High res crop of the detected card area
            cardCanvas.width = cardRect.w;
            cardCanvas.height = cardRect.h;
            cCtx.drawImage(
              video, 
              cardRect.x, cardRect.y, cardRect.w, cardRect.h, 
              0, 0, cardRect.w, cardRect.h
            );
            
            const result = await extractNameLocally(cardCanvas);
            setDetectedData(result);
          }
          setIsProcessing(false);
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isScanning, cvReady, loading, cardRect, isProcessing]);

  const handleCapture = async () => {
    if (!detectedData || loading) return;
    setLoading(true);

    const { name, number } = detectedData;
    let match = SURGING_SPARKS_DATA.find(c => 
      c.name.toLowerCase().includes(name.toLowerCase()) && 
      (number ? c.number.includes(number) : true)
    );

    try {
      if (!match) {
        const aiMatch = await manualCardLookup(`${name} ${number || ''} pokemon card official`);
        if (aiMatch) match = aiMatch as any;
      }

      const finalCard: PokemonCard = {
        id: Math.random().toString(36).substring(7),
        name: match?.name || name,
        number: match?.number || number || '???',
        set: match?.set || 'Unknown',
        rarity: match?.rarity || 'Common',
        type: match?.type || 'Unknown',
        marketValue: match?.marketValue || '$--.--',
        imageUrl: match?.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${name}`,
        scanDate: new Date().toLocaleDateString()
      };

      setScanResult({ name: finalCard.name, price: finalCard.marketValue || '$??' });
      onCardDetected(finalCard);
      setTimeout(() => setScanResult(null), 3000);
    } catch (e) {
      setError("SYNC_FAILED");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col" onClick={handleCapture}>
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
      
      {/* HUD: Card Boundary Tracker */}
      {cardRect && (
        <div 
          style={{
            left: `${(cardRect.x / videoRef.current!.videoWidth) * 100}%`,
            top: `${(cardRect.y / videoRef.current!.videoHeight) * 100}%`,
            width: `${(cardRect.w / videoRef.current!.videoWidth) * 100}%`,
            height: `${(cardRect.h / videoRef.current!.videoHeight) * 100}%`
          }}
          className="absolute border-2 border-green-400 rounded-lg shadow-[0_0_20px_rgba(74,222,128,0.5)] transition-all duration-100 ease-out z-20 pointer-events-none"
        >
          <div className="absolute -top-8 left-0 flex items-center gap-2">
            <span className="bg-green-500 text-black px-2 py-0.5 text-[10px] font-orbitron font-black uppercase">
              {detectedData?.name || 'ACQUIRING_ASSET...'}
            </span>
            <span className="bg-black/50 backdrop-blur-md text-white px-2 py-0.5 text-[8px] font-orbitron">
              {detectedData?.strategyUsed || 'SCANNING...'}
            </span>
          </div>
          
          {/* Animated corners */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white"></div>
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white"></div>
        </div>
      )}

      {/* Main Scanner Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        {!cardRect && (
          <div className="bg-slate-950/80 backdrop-blur-xl border border-cyan-500/30 px-8 py-6 rounded-3xl text-center">
             <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
             <p className="text-cyan-400 font-orbitron font-black text-xs uppercase tracking-[0.2em]">Position Card in View</p>
             <p className="text-slate-500 text-[9px] uppercase tracking-widest mt-2">Adjusting for light and color contrast</p>
          </div>
        )}

        {scanResult && (
           <div className="bg-slate-900 border-2 border-green-500/50 p-12 rounded-[4rem] shadow-2xl animate-in zoom-in duration-500 text-center">
              <div className="text-4xl font-orbitron font-black text-white mb-4">{scanResult.name}</div>
              <div className="text-2xl font-orbitron text-green-400">{scanResult.price}</div>
              <div className="mt-6 text-[10px] text-green-500 uppercase font-black tracking-[0.3em]">Vault Synchronized</div>
           </div>
        )}
      </div>

      <div className="absolute bottom-10 left-0 w-full px-8 flex justify-between items-end">
        <div className="bg-slate-950/80 backdrop-blur-md p-4 rounded-2xl border border-white/5">
           <div className="flex items-center gap-2 mb-2">
             <div className={`w-2 h-2 rounded-full ${cvReady ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
             <span className="text-[9px] font-orbitron font-black text-white uppercase tracking-widest">Neural Vision {cvReady ? 'Active' : 'Booting'}</span>
           </div>
           <p className="text-[8px] text-slate-500 uppercase tracking-tighter leading-none">
             Searching: {detectedData?.strategyUsed || 'IDLE'}
           </p>
        </div>

        {detectedData && (
          <button className="bg-white text-black font-orbitron font-black px-10 py-5 rounded-2xl text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.3)] animate-bounce">
            Tap to Vault
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={cardCanvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
