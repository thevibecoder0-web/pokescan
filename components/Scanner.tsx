
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { identifyPokemonCard } from '../services/geminiService';
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
  const [detection, setDetection] = useState<{name: string, cost: string} | null>(null);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Unable to access camera. Please ensure permissions are granted.");
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
    if (isScanning) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isScanning]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true);
    setDetection(null);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullResImage = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      const result = await identifyPokemonCard(fullResImage);

      if (result && result.name && result.name.toLowerCase() !== 'unknown') {
        setDetection({
          name: result.name,
          cost: result.marketValue || "$??.??"
        });
      } else {
        setError("Card Not Recognized");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl shadow-2xl bg-black border-2 border-slate-800 flex flex-col">
      <div className="relative aspect-[3/4] sm:aspect-video bg-slate-900 overflow-hidden">
        {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600/90 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-xl backdrop-blur-sm">
                {error}
            </div>
        )}

        {isScanning ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover transition-opacity duration-500 opacity-90 contrast-125"
            />
            
            {/* Overlay UI */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              
              {/* Central Result Label */}
              {(detection || loading) && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-slate-950/95 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4 transition-all scale-110">
                    <div className="relative">
                      <div className={`w-3 h-3 rounded-full ${loading ? 'bg-yellow-500 animate-ping' : 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]'}`}></div>
                      {loading && <div className="absolute inset-0 w-3 h-3 rounded-full bg-yellow-500"></div>}
                    </div>
                    
                    <div className="flex items-center gap-3 divide-x divide-white/10">
                      <span className="text-[14px] font-orbitron font-black uppercase tracking-[0.1em] text-white">
                        {loading ? 'IDENTIFYING...' : detection?.name}
                      </span>
                      {detection && !loading && (
                        <span className="pl-3 text-[14px] font-orbitron font-black text-green-500 tracking-wider">
                          {detection.cost}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Guide Frame (Minimalist) */}
              {!detection && !loading && (
                <div className="w-[60%] aspect-[2.5/3.5] border border-white/10 rounded-3xl flex items-center justify-center">
                   <div className="text-[10px] font-orbitron font-bold text-white/20 uppercase tracking-[0.4em]">Align Asset</div>
                </div>
              )}
            </div>

            {/* Version Identifier */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-1">
              <div className="text-[10px] font-orbitron font-black text-white/20 uppercase tracking-[0.3em]">
                 SENSOR_STATE: ACTIVE
              </div>
              <div className="text-[9px] font-orbitron font-bold text-red-500/40 uppercase tracking-widest">
                 v1.0.9 - OPTICAL_FEED
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-12 px-4">
              <button
                onClick={() => setIsScanning(false)}
                className="w-14 h-14 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-xl hover:scale-110 active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-28 h-28 rounded-full border-8 flex items-center justify-center transition-all duration-300 ${
                    loading ? 'border-yellow-500 bg-yellow-500/10' : 'border-white bg-red-600 shadow-[0_0_60px_rgba(220,38,38,0.5)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-12 w-12 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white group-hover:scale-95 transition-transform shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]"></div>
                  )}
                </div>
                {!loading && <div className="absolute -inset-2 rounded-full border-2 border-red-500/20 animate-ping pointer-events-none"></div>}
              </button>
              
              <div className="w-14 h-14"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-12 text-center bg-slate-950">
             <div className="w-20 h-20 mb-8 border-4 border-red-600 rounded-full flex items-center justify-center opacity-20 animate-pulse">
                <div className="w-12 h-12 bg-red-600 rounded-full"></div>
             </div>
             <button onClick={startCamera} className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-2xl transition-all uppercase tracking-[0.3em] text-xs active:scale-95 border border-red-400/30">
               Access Scanner
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
