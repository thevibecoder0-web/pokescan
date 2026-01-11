
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { extractNameLocally, OCRResult } from '../services/ocrService';
import { manualCardLookup } from '../services/geminiService';
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
          width: { ideal: 1920 }, 
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
      }, 400); // Slightly slower interval for dual-zone processing
    }
    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal]);

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    if (detectedData) {
      setLoading(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 150);

      const { name, number } = detectedData;
      
      // Try Local Database First (Surging Sparks)
      let localMatch = SURGING_SPARKS_DATA.find(c => {
        const nameMatch = c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase());
        const numMatch = number ? c.number.includes(number) : true;
        return nameMatch && numMatch;
      });

      if (localMatch) {
        const result: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          ...localMatch,
          scanDate: new Date().toLocaleDateString(),
        };
        setScanResult({ name: result.name, price: result.marketValue || "N/A" });
        onCardDetected(result);
        setTimeout(() => setScanResult(null), 2500);
        setLoading(false);
      } else {
        // AI Sync: Find Official Image Online
        try {
          const query = `${name} ${number || ''} pokemon card tcgplayer market price and official artwork`;
          const aiData = await manualCardLookup(query);
          if (aiData) {
            const result: PokemonCard = {
              id: Math.random().toString(36).substr(2, 9),
              ...aiData,
              imageUrl: aiData.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(name)}`,
              scanDate: new Date().toLocaleDateString(),
            };
            setScanResult({ name: result.name, price: result.marketValue || "N/A" });
            onCardDetected(result);
          } else {
            // Fallback if AI fails
            onCardDetected({
              id: Math.random().toString(36).substr(2, 9),
              name: name,
              set: "Unknown",
              number: number || "???",
              rarity: "Common",
              type: "Unknown",
              scanDate: new Date().toLocaleDateString(),
              imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(name)}+${number || ''}`
            });
          }
        } catch (e) {
          setError("SYNC_ERROR: Card found, but metadata retrieval failed.");
        } finally {
          setTimeout(() => setScanResult(null), 2500);
          setLoading(false);
        }
      }
    } else {
      setError("NO_TARGET_DETECTED: Align name and number in scan zone.");
      setTimeout(() => setError(null), 3000);
    }
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
          className={`w-full h-full object-cover transition-all duration-1000 ${
            loading ? 'opacity-30 blur-3xl scale-125' : 'opacity-100'
          }`}
        />
        {flash && <div className="absolute inset-0 z-50 bg-white/80 pointer-events-none" />}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Top Scan Bar */}
        <div className="absolute top-0 left-0 w-full h-[18%] border-b border-cyan-500/30 bg-cyan-500/5 backdrop-blur-[2px]">
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border bg-cyan-900/60 border-cyan-400/30">
                <span className="text-[8px] font-orbitron font-black tracking-[0.4em] uppercase text-cyan-400">
                  Dual_Sensor_Active
                </span>
            </div>
        </div>

        {/* Bottom Scan Bar */}
        <div className="absolute bottom-0 left-0 w-full h-[18%] border-t border-purple-500/30 bg-purple-500/5 backdrop-blur-[2px]">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border bg-purple-900/60 border-purple-400/30">
                <span className="text-[8px] font-orbitron font-black tracking-[0.4em] uppercase text-purple-400">
                  Number_Index_Ready
                </span>
            </div>
        </div>

        {detectedData && (
          <div 
            style={getReticleStyle() as any}
            className="absolute border-2 border-cyan-400 rounded shadow-[0_0_20px_rgba(34,211,238,1)] transition-all duration-150 ease-out"
          >
            <div className="absolute -top-6 left-0 bg-cyan-400 text-black px-2 py-0.5 text-[9px] font-orbitron font-black uppercase tracking-tighter whitespace-nowrap">
              LOCK: {detectedData.name} {detectedData.number && `[#${detectedData.number}]`}
            </div>
          </div>
        )}

        {!loading && (
          <div className="absolute top-0 left-0 w-full h-[18%] overflow-hidden">
             <div className="w-full h-[3px] bg-cyan-400 shadow-[0_0_15px_cyan] animate-scanline"></div>
          </div>
        )}
      </div>

      <div className="relative z-20 w-full h-full flex flex-col items-center pointer-events-none p-6">
          <div className="absolute top-[25%] -translate-y-full w-full max-w-sm px-6 transition-transform duration-500">
            <div className="bg-slate-950/90 backdrop-blur-3xl border border-white/10 px-8 py-6 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.7)] text-center">
                <span className="text-xl sm:text-3xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {loading ? "SEARCHING..." : (detectedData?.name || "ALIGN CARD")}
                </span>
                
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${detectedData ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`}></div>
                  <span className={`text-[8px] font-orbitron font-black tracking-[0.5em] uppercase transition-colors ${detectedData ? 'text-cyan-400' : 'text-slate-600'}`}>
                    {loading ? 'ONLINE_SYNC' : detectedData ? `TARGET_LOCK ${detectedData.number ? 'INDEX_OK' : ''}` : 'SCANNING_REGIONS'}
                  </span>
                </div>
            </div>
          </div>

          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-5 pointer-events-auto">
            <p className="text-white text-[9px] font-orbitron uppercase tracking-widest text-center bg-slate-950/50 backdrop-blur-md px-6 py-3 rounded-full border border-white/5">
                {detectedData ? 'Tap to sync official image and details' : 'Position card name in top bar and number in bottom bar'}
            </p>
          </div>

          {scanResult && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-2xl z-40 animate-in fade-in zoom-in duration-500">
                  <div className="bg-slate-900 border-2 border-green-500/50 p-12 rounded-[5rem] shadow-[0_0_150px_rgba(34,197,94,0.4)] flex flex-col items-center gap-8 text-center max-w-sm w-full">
                      <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.8)] animate-bounce">
                          <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-3xl font-orbitron font-black text-white uppercase tracking-tighter leading-none">{scanResult.name}</h2>
                        <span className="text-green-400 font-orbitron font-bold text-2xl tracking-widest">{scanResult.price}</span>
                      </div>
                  </div>
              </div>
          )}

          {error && (
              <div className="absolute top-[45%] left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-10 py-5 rounded-3xl text-[10px] font-orbitron font-black shadow-[0_0_50px_rgba(220,38,38,0.5)] uppercase tracking-[0.3em] text-center max-w-[80vw]">
                  {error}
              </div>
          )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
