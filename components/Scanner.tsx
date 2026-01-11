
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { PokemonCard } from '../types';
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';

interface ScannerProps {
  onCardDetected: (card: PokemonCard) => void;
  isScanning: boolean;
  setIsScanning: (val: boolean) => void;
  onDeepScanRequest?: (image: string) => void;
}

const Scanner: React.FC<ScannerProps> = ({ onCardDetected, isScanning, setIsScanning, onDeepScanRequest }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    let interval: number;
    if (isScanning && !loading) {
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
  }, [isScanning, loading, isProcessingLocal]);

  const handleDeepScan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current || !canvasRef.current || !onDeepScanRequest) return;
    
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (context && videoRef.current) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      onDeepScanRequest(canvas.toDataURL('image/jpeg', 0.9));
    }
  };

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const name = detectedData?.name;

    if (name) {
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
    } else {
      setError("TARGET_NOT_LOCKED");
      setTimeout(() => setError(null), 3000);
    }
    setLoading(false);
  }, [loading, onCardDetected, detectedData]);

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
          className={`w-full h-full object-cover transition-all duration-700 ${loading ? 'opacity-50 blur-xl scale-110' : 'opacity-100'}`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/70 pointer-events-none" />}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[18%] border-b border-cyan-500/30 bg-cyan-500/5 backdrop-blur-[2px]">
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 bg-cyan-900/60 rounded-full border border-cyan-400/30">
                <span className="text-[7px] font-orbitron font-black text-cyan-400 tracking-[0.4em] uppercase">Primary_Name_Sensor</span>
            </div>
        </div>

        {detectedData && (
          <div 
            style={getReticleStyle() as any}
            className="absolute border-2 border-cyan-400 rounded shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-all duration-150 ease-out"
          >
            <div className="absolute -top-6 left-0 bg-cyan-400 text-black px-1.5 py-0.5 text-[8px] font-orbitron font-black uppercase tracking-tighter whitespace-nowrap">
              IDENTIFIED: {detectedData.name}
            </div>
          </div>
        )}

        {!loading && (
          <div className="absolute top-0 left-0 w-full h-[18%] overflow-hidden">
             <div className="w-full h-[2px] bg-cyan-400/50 shadow-[0_0_10px_cyan] animate-scanline"></div>
          </div>
        )}
      </div>

      <div className="relative z-20 w-full h-full flex flex-col items-center pointer-events-none p-6">
          <div className="absolute top-[25%] -translate-y-full w-full max-w-sm px-6 transition-transform duration-500">
            <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/10 px-8 py-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center border-t-2 border-white/5">
                <span className="text-xl sm:text-2xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {loading ? "PROCESSING..." : (detectedData?.name || "ALIGN CARD NAME")}
                </span>
                
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${detectedData ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[7px] font-orbitron font-black tracking-[0.4em] uppercase ${detectedData ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {loading ? 'Analyzing' : detectedData ? 'LOCKED' : 'Searching Header'}
                  </span>
                </div>
            </div>
          </div>

          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-auto">
            <button 
              onClick={handleDeepScan}
              className="px-8 py-4 bg-slate-950/80 backdrop-blur-md border border-cyan-500/40 text-cyan-400 font-orbitron font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-cyan-500 hover:text-slate-950 transition-all active:scale-95 shadow-2xl"
            >
              Neural Deep Scan (Pro)
            </button>
          </div>

          {scanResult && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-md z-40 animate-in fade-in zoom-in duration-300">
                  <div className="bg-slate-950 border border-green-500/40 p-10 rounded-[4rem] shadow-[0_0_100px_rgba(34,197,94,0.3)] flex flex-col items-center gap-6 text-center max-w-xs w-full">
                      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.6)]">
                          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <h2 className="text-3xl font-orbitron font-black text-white uppercase tracking-tighter leading-none">{scanResult.name}</h2>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[40%] left-1/2 -translate-x-1/2 z-[60] bg-red-600/90 backdrop-blur-xl text-white px-8 py-3 rounded-2xl text-[10px] font-orbitron font-black shadow-2xl uppercase tracking-widest">
                  {error}
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
