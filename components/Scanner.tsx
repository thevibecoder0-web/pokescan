
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { identifyPokemonCard } from '../services/geminiService';
import { PokemonCard } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

interface ScannerProps {
  onCardDetected: (card: PokemonCard) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [neuralProcessing, setNeuralProcessing] = useState(false);
  const [detectedData, setDetectedData] = useState<OCRResult | null>(null);
  const [scanResult, setScanResult] = useState<{name: string, price: string} | null>(null);
  const [flash, setFlash] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 }, // Higher resolution for better detail in bad light
          height: { ideal: 1080 } 
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("CAMERA_LINK_FAILED");
      console.error(err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isScanning) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isScanning]);

  // CONTINUOUS OCR LOOP (LOCAL)
  useEffect(() => {
    let interval: number;
    if (isScanning && !loading && !neuralProcessing) {
      interval = window.setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || isProcessingLocal || loading) return;

        setIsProcessingLocal(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });

        if (context && video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const result = await extractNameLocally(canvas);
            setDetectedData(result);
          } catch (e) {
            console.warn("Frame analysis skip...");
          }
        }
        setIsProcessingLocal(false);
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal, neuralProcessing]);

  // NEURAL DEEP SCAN (PRO ID) WITH AGGRESSIVE ENHANCEMENT
  const triggerNeuralDeepScan = async () => {
    if (!videoRef.current || !canvasRef.current || loading || neuralProcessing) return;

    setNeuralProcessing(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // AGGRESSIVE ENHANCEMENT FOR LOW LIGHT
      // We apply multiple filters to bring out hidden details
      // 1. Boost brightness significantly
      // 2. High contrast to separate card from background
      // 3. Sharpening simulation (contrast + saturation)
      context.filter = 'brightness(1.5) contrast(1.3) saturate(1.2) sepia(0.1)';
      context.drawImage(video, 0, 0);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = base64Image.split(',')[1];

      try {
        const result = await identifyPokemonCard(base64Data);
        if (result) {
          const finalCard: PokemonCard = {
            id: Math.random().toString(36).substr(2, 9),
            ...result,
            imageUrl: base64Image,
            scanDate: new Date().toLocaleDateString(),
          };
          setScanResult({ name: finalCard.name, price: finalCard.marketValue || "$??.??" });
          onCardDetected(finalCard);
          setTimeout(() => setScanResult(null), 3000);
        } else {
          setError("NEURAL_ANALYSIS_STALLED: Try bringing the card closer or adding light.");
          setTimeout(() => setError(null), 5000);
        }
      } catch (err) {
        setError("AI_ENGINE_TIMEOUT: Check network connection.");
        setTimeout(() => setError(null), 4000);
      }
    }
    setNeuralProcessing(false);
  };

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading || neuralProcessing) return;

    if (detectedData) {
      setLoading(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 150);

      const name = detectedData.name;
      const localMatch = SURGING_SPARKS_DATA.find(c => 
          c.name.toLowerCase().includes(name.toLowerCase()) || 
          name.toLowerCase().includes(c.name.toLowerCase())
      );

      const result: PokemonCard = {
        id: Math.random().toString(36).substr(2, 9),
        name: localMatch?.name || name,
        marketValue: localMatch?.marketValue || "$--.--",
        set: localMatch?.set || "Local Scan",
        rarity: localMatch?.rarity || "Common",
        type: localMatch?.type || "Unknown",
        number: localMatch?.number || "???",
        scanDate: new Date().toLocaleDateString(),
        imageUrl: localMatch?.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(name)}`
      };

      setScanResult({ name: result.name, price: result.marketValue || "N/A" });
      onCardDetected(result);
      setTimeout(() => setScanResult(null), 2500);
      setLoading(false);
    } else {
      triggerNeuralDeepScan();
    }
  }, [loading, neuralProcessing, onCardDetected, detectedData]);

  const getReticleStyle = () => {
    if (!detectedData?.bbox || !videoRef.current) return { display: 'none' };
    const video = videoRef.current;
    const { x0, y0, x1, y1 } = detectedData.bbox;
    const scaleX = 100 / video.videoWidth;
    const scaleY = 100 / video.videoHeight;
    return {
      left: `${x0 * scaleX}%`,
      top: `${y0 * scaleY}%`,
      width: `${(x1 - x0) * scaleX}%`,
      height: `${(y1 - y0) * scaleY}%`,
      display: 'block'
    };
  };

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden flex flex-col transition-all duration-700 cursor-pointer"
      onClick={handleCaptureAndBind}
    >
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-all duration-1000 ${
            (loading || neuralProcessing) ? 'opacity-30 blur-3xl scale-125' : 'opacity-100'
          }`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/80 pointer-events-none" />}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className={`absolute top-0 left-0 w-full h-[18%] border-b border-cyan-500/30 transition-all duration-700 ${neuralProcessing ? 'bg-purple-600/20 border-purple-400' : 'bg-cyan-500/5'}`}>
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border transition-all ${neuralProcessing ? 'bg-purple-900 border-purple-400 animate-pulse' : 'bg-cyan-900/60 border-cyan-400/30'}`}>
                <span className={`text-[8px] font-orbitron font-black tracking-[0.4em] uppercase transition-colors ${neuralProcessing ? 'text-purple-300' : 'text-cyan-400'}`}>
                  {neuralProcessing ? 'NEURAL_ENHANCEMENT_ACTIVE' : 'READY_FOR_ACQUISITION'}
                </span>
            </div>
        </div>

        {detectedData && !neuralProcessing && (
          <div 
            style={getReticleStyle() as any}
            className="absolute border-2 border-cyan-400 rounded shadow-[0_0_20px_rgba(34,211,238,1)] transition-all duration-150 ease-out"
          >
            <div className="absolute -top-6 left-0 bg-cyan-400 text-black px-2 py-0.5 text-[9px] font-orbitron font-black uppercase tracking-tighter whitespace-nowrap">
              LOCK: {detectedData.name}
            </div>
          </div>
        )}

        {!loading && !neuralProcessing && (
          <div className="absolute top-0 left-0 w-full h-[18%] overflow-hidden">
             <div className="w-full h-[3px] bg-cyan-400 shadow-[0_0_15px_cyan] animate-scanline"></div>
          </div>
        )}

        {neuralProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-md">
            <div className="w-64 h-64 relative flex items-center justify-center scale-110 sm:scale-150">
               <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>
               <div className="absolute inset-4 border-r-4 border-cyan-400 rounded-full animate-spin-slow"></div>
               <div className="absolute inset-8 border-b-4 border-pink-500 rounded-full animate-spin opacity-50"></div>
               <span className="text-white font-orbitron font-black text-[10px] animate-pulse tracking-widest">ENHANCING_ASSET</span>
            </div>
            <div className="mt-16 flex flex-col items-center gap-2">
                <p className="text-white/80 font-orbitron text-[9px] uppercase tracking-[0.5em] animate-pulse">Neural Reconstruct in progress...</p>
                <p className="text-purple-400 font-orbitron text-[7px] uppercase tracking-[0.3em]">Normalizing exposure & spectral data</p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-20 w-full h-full flex flex-col items-center pointer-events-none p-6">
          <div className="absolute top-[25%] -translate-y-full w-full max-w-sm px-6 transition-transform duration-500">
            <div className={`bg-slate-950/90 backdrop-blur-3xl border px-8 py-6 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.7)] text-center transition-all duration-700 ${neuralProcessing ? 'border-purple-500/50 scale-105' : 'border-white/10'}`}>
                <span className={`text-xl sm:text-3xl font-orbitron font-black tracking-tighter block truncate transition-colors ${neuralProcessing ? 'text-purple-300' : 'text-white'}`}>
                    {neuralProcessing ? "AI_PROCESSING..." : loading ? "STORING..." : (detectedData?.name || "CENTER CARD")}
                </span>
                
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${detectedData || neuralProcessing ? (neuralProcessing ? 'bg-purple-400' : 'bg-cyan-400') + ' animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[8px] font-orbitron font-black tracking-[0.5em] uppercase transition-colors ${neuralProcessing ? 'text-purple-400' : detectedData ? 'text-cyan-400' : 'text-slate-600'}`}>
                    {neuralProcessing ? 'DEEP_BRAIN' : loading ? 'SYNC_VAULT' : detectedData ? 'OCR_TARGET' : 'SEARCHING_HEADER'}
                  </span>
                </div>
            </div>
          </div>

          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-5 pointer-events-auto">
            <button 
              onClick={(e) => { e.stopPropagation(); triggerNeuralDeepScan(); }}
              className="group px-12 py-5 bg-slate-950/90 backdrop-blur-xl border border-purple-500/50 text-purple-400 font-orbitron font-black text-[11px] uppercase tracking-[0.4em] rounded-[2rem] hover:bg-purple-600 hover:text-white hover:border-white/20 transition-all active:scale-90 shadow-[0_20px_50px_rgba(168,85,247,0.3)] flex items-center gap-4"
            >
              <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-ping group-hover:bg-white"></div>
              Neural Boost (Pro ID)
            </button>
            <div className="flex flex-col items-center gap-1 opacity-60">
                <p className="text-white text-[9px] font-orbitron uppercase tracking-widest text-center">
                    Tap to Store Lock or Capture Boost
                </p>
            </div>
          </div>

          {scanResult && !loading && !neuralProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-2xl z-40 animate-in fade-in zoom-in duration-500">
                  <div className="bg-slate-900 border-2 border-green-500/50 p-12 rounded-[5rem] shadow-[0_0_150px_rgba(34,197,94,0.4)] flex flex-col items-center gap-8 text-center max-w-sm w-full transform -rotate-1">
                      <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.8)] animate-bounce">
                          <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-3xl font-orbitron font-black text-white uppercase tracking-tighter leading-none">{scanResult.name}</h2>
                        <div className="flex items-center justify-center gap-2">
                             <div className="h-px w-8 bg-slate-700"></div>
                             <span className="text-green-400 font-orbitron font-bold text-2xl tracking-widest">{scanResult.price}</span>
                             <div className="h-px w-8 bg-slate-700"></div>
                        </div>
                      </div>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[45%] left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-10 py-5 rounded-3xl text-[10px] font-orbitron font-black shadow-[0_0_50px_rgba(220,38,38,0.5)] uppercase tracking-[0.3em] text-center max-w-[80vw]">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    {error}
                  </div>
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
