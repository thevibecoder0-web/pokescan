
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
import { extractNameLocally } from '../services/ocrService';
import { PokemonCard } from '../types';

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
  const [liveDetectedName, setLiveDetectedName] = useState<string | null>(null);
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

  // BACKGROUND CONTINUOUS SCANNING LOOP
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
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          try {
            const name = await extractNameLocally(canvas);
            if (name) {
              setLiveDetectedName(name);
            }
          } catch (e) {
            console.warn("OCR Tick Offline");
          }
        }
        setIsProcessingLocal(false);
      }, 1000); 
    }

    return () => clearInterval(interval);
  }, [isScanning, loading, isProcessingLocal]);

  const handleCaptureAndBind = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { alpha: false });

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullImageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      
      const result = await identifyPokemonCard(fullImageBase64, false);

      if (result && result.name) {
        setScanResult({ name: result.name, price: result.marketValue || "$--.--" });
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: result.imageUrl || `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(result.name)}`
        });
        setTimeout(() => setScanResult(null), 2500);
      } else if (liveDetectedName) {
        onCardDetected({
          id: Math.random().toString(36).substr(2, 9),
          name: liveDetectedName,
          marketValue: "$--.--",
          set: "Local Scan",
          rarity: "Common",
          type: "Unknown",
          number: "???",
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://placehold.co/400x560/1e293b/white?text=${encodeURIComponent(liveDetectedName)}`
        });
        setScanResult({ name: liveDetectedName, price: "N/A" });
        setTimeout(() => setScanResult(null), 2500);
      } else {
        setError("NEURAL_LINK_ERROR");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected, liveDetectedName]);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden flex flex-col transition-all duration-700 cursor-pointer"
      onClick={handleCaptureAndBind}
    >
      {/* Camera Feed - Takes up the entire area */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-all duration-700 ${loading ? 'opacity-50 blur-xl scale-110' : 'opacity-100'}`}
        />
        
        {/* Flash Effect */}
        {flash && <div className="absolute inset-0 z-50 bg-white/70 pointer-events-none" />}
      </div>

      {/* Simplified HUD Overlay */}
      <div className="relative z-10 w-full h-full flex flex-col justify-end items-center pointer-events-none p-10">
          
          {/* Card Name Display - Positioned at bottom center, clean and visible */}
          <div className={`mb-12 transition-all duration-500 ${liveDetectedName || loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="bg-slate-950/60 backdrop-blur-3xl border border-white/10 px-10 py-5 rounded-[2rem] shadow-2xl text-center border-b-4 border-slate-900">
                <span className="text-2xl sm:text-3xl font-orbitron font-black text-white tracking-tighter block truncate">
                    {loading ? "IDENTIFYING..." : (liveDetectedName || "ALIGN CARD TOP")}
                </span>
                {!loading && liveDetectedName && (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                    <span className="text-[8px] font-orbitron font-black text-cyan-400 tracking-[0.4em] uppercase">Ready to Bind</span>
                  </div>
                )}
            </div>
          </div>

          {/* Success Result Overlay */}
          {scanResult && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300">
                  <div className="bg-slate-950 border border-green-500/30 p-8 rounded-[3rem] shadow-[0_0_80px_rgba(34,197,94,0.2)] flex flex-col items-center gap-4 text-center">
                      <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-orbitron font-black text-white uppercase tracking-tighter">{scanResult.name}</h2>
                        <p className="text-green-400 font-bold text-[10px] tracking-widest uppercase mt-1">Secured: {scanResult.price}</p>
                      </div>
                  </div>
              </div>
          )}

          {/* Error Message */}
          {error && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[60] bg-red-600/90 backdrop-blur-xl text-white px-8 py-3 rounded-2xl text-[10px] font-orbitron font-black shadow-2xl animate-in slide-in-from-top-10 duration-500">
                  {error}
              </div>
          )}
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
