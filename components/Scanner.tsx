
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
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
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
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal, neuralProcessing]);

  // NEURAL DEEP SCAN (PRO ID) WITH IMAGE ENHANCEMENT
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
      
      // PRE-PROCESSING FOR BAD LIGHTING
      // We apply a brightness and contrast boost to the image before sending it to Gemini
      context.filter = 'brightness(1.2) contrast(1.1) saturate(1.1)';
      context.drawImage(video, 0, 0);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.85);
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
          setError("NEURAL_LINK_ERROR: Asset unrecognizable. Check lighting.");
          setTimeout(() => setError(null), 4000);
        }
      } catch (err) {
        setError("AI_ENGINE_OFFLINE");
        setTimeout(() => setError(null), 3000);
      }
    }
    setNeuralProcessing(false);
  };

  const handleCaptureAndBind = useCallback(async () => {
    // If local OCR has a lock, we can store immediately. 
    // Otherwise, we trigger a Neural Deep Scan.
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
      // If no local name found, perform a deep neural scan
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
            (loading || neuralProcessing) ? 'opacity-40 blur-2xl scale-110' : 'opacity-100'
          }`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/70 pointer-events-none" />}
      </div>

      {/* OVERLAYS & UI */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Scanner ROI */}
        <div className={`absolute top-0 left-0 w-full h-[18%] border-b border-cyan-500/30 transition-colors duration-500 ${neuralProcessing ? 'bg-purple-500/10 border-purple-500/50' : 'bg-cyan-500/5'}`}>
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border transition-all ${neuralProcessing ? 'bg-purple-900/60 border-purple-400/30' : 'bg-cyan-900/60 border-cyan-400/30'}`}>
                <span className={`text-[7px] font-orbitron font-black tracking-[0.4em] uppercase transition-colors ${neuralProcessing ? 'text-purple-400' : 'text-cyan-400'}`}>
                  {neuralProcessing ? 'Neural_Asset_Lock' : 'Optical_Sensor_Active'}
                </span>
            </div>
        </div>

        {/* OCR Reticle */}
        {detectedData && !neuralProcessing && (
          <div 
            style={getReticleStyle() as any}
            className="absolute border-2 border-cyan-400 rounded shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-all duration-150 ease-out"
          >
            <div className="absolute -top-6 left-0 bg-cyan-400 text-black px-1.5 py-0.5 text-[8px] font-orbitron font-black uppercase tracking-tighter whitespace-nowrap">
              LOCAL_LOCK: {detectedData.name}
            </div>
          </div>
        )}

        {/* Scan Line */}
        {!loading && !neuralProcessing && (
          <div className="absolute top-0 left-0 w-full h-[18%] overflow-hidden">
             <div className="w-full h-[2px] bg-cyan-400/50 shadow-[0_0_10px_cyan] animate-scanline"></div>
          </div>
        )}

        {/* Neural Processing Visuals */}
        {neuralProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/20 backdrop-blur-sm">
            <div className="w-48 h-48 relative flex items-center justify-center">
               <div className="absolute inset-0 border-t-4 border-purple-500 rounded-full animate-spin"></div>
               <div className="absolute inset-4 border-b-4 border-cyan-400 rounded-full animate-spin-slow"></div>
               <span className="text-white font-orbitron font-black text-xs animate-pulse">NEURAL_DEEP_SCAN</span>
            </div>
            <p className="mt-8 text-white/50 font-orbitron text-[8px] uppercase tracking-[0.5em] animate-pulse">Reconstructing visual assets from noisy stream...</p>
          </div>
        )}
      </div>

      <div className="relative z-20 w-full h-full flex flex-col items-center pointer-events-none p-6">
          <div className="absolute top-[25%] -translate-y-full w-full max-w-sm px-6 transition-transform duration-500">
            <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/10 px-8 py-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center border-t-2 border-white/5">
                <span className="text-xl sm:text-2xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {neuralProcessing ? "NEURAL_LINKING..." : loading ? "STORING..." : (detectedData?.name || "ALIGN CARD NAME")}
                </span>
                
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${detectedData || neuralProcessing ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[7px] font-orbitron font-black tracking-[0.4em] uppercase ${detectedData || neuralProcessing ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {neuralProcessing ? 'Neural Analysis' : loading ? 'Syncing' : detectedData ? 'OCR_LOCK' : 'Target Acquisition'}
                  </span>
                </div>
            </div>
          </div>

          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 pointer-events-auto">
            <button 
              onClick={(e) => { e.stopPropagation(); triggerNeuralDeepScan(); }}
              className="px-10 py-4 bg-slate-950/80 backdrop-blur-md border border-purple-500/40 text-purple-400 font-orbitron font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-purple-500 hover:text-slate-950 transition-all active:scale-95 shadow-2xl flex items-center gap-3"
            >
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-ping"></div>
              Neural Enhance (Pro)
            </button>
            <p className="text-white/40 text-[8px] font-orbitron uppercase tracking-widest text-center max-w-[200px]">
              Tap screen to Quick-Add, or use Neural Enhance for better low-light accuracy.
            </p>
          </div>

          {scanResult && !loading && !neuralProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-md z-40 animate-in fade-in zoom-in duration-300">
                  <div className="bg-slate-950 border border-green-500/40 p-10 rounded-[4rem] shadow-[0_0_100px_rgba(34,197,94,0.3)] flex flex-col items-center gap-6 text-center max-w-xs w-full">
                      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.6)]">
                          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <h2 className="text-2xl font-orbitron font-black text-white uppercase tracking-tighter leading-none">{scanResult.name}</h2>
                      <span className="text-green-400 font-orbitron font-bold text-lg">{scanResult.price}</span>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[40%] left-1/2 -translate-x-1/2 z-[60] bg-red-600/90 backdrop-blur-xl text-white px-8 py-3 rounded-2xl text-[10px] font-orbitron font-black shadow-2xl uppercase tracking-widest text-center whitespace-nowrap">
                  {error}
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
