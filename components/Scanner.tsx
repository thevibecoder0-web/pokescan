
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
  const [detectedName, setDetectedName] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    setDetectedName(null);
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
        // Display the text found in the top left
        setDetectedName(result.name);
        
        /** 
         * Note: Per user request, we aren't "doing anything" right now 
         * except displaying the name. The auto-add to vault is disabled here.
         * If we wanted to add it, we'd call onCardDetected(newCard).
         */
      } else {
        setDetectedName("Text Not Found");
        setTimeout(() => setDetectedName(null), 3000);
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
              className="w-full h-full object-cover"
            />
            
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className={`relative w-[70%] sm:w-[35%] aspect-[2.5/3.5] border-2 transition-all duration-300 rounded-3xl ${
                  loading ? 'border-yellow-400 scale-105 shadow-[0_0_50px_rgba(250,204,21,0.5)]' : 'border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
              }`}>
                {/* Frame Corners */}
                <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
                <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
                <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
                <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl"></div>
                
                {/* Top-Left Label (Displays extracted Card Name) */}
                <div className="absolute -top-10 left-0 bg-slate-950/90 backdrop-blur-xl px-4 py-1.5 rounded-lg border border-white/20 whitespace-nowrap shadow-2xl flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-red-600'}`}></div>
                  <span className="text-[10px] font-orbitron font-bold uppercase tracking-[0.1em] text-white">
                    {loading ? 'Reading Top-Left...' : (detectedName || 'Position Card')}
                  </span>
                </div>

                {/* Bottom-Left Version Info */}
                <div className="absolute -bottom-10 left-0 text-[9px] font-orbitron font-bold text-slate-500 uppercase tracking-widest px-1">
                   SV8 v1.0.5 - DEV BUILD
                </div>
              </div>
            </div>

            <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-8 px-4">
              <button
                onClick={() => setIsScanning(false)}
                className="w-16 h-16 rounded-full bg-slate-950/90 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-xl hover:scale-110 active:scale-90"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-24 h-24 rounded-full border-[6px] flex items-center justify-center transition-all ${
                    loading ? 'border-yellow-500 bg-yellow-500/20' : 'border-white bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.6)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-10 w-10 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-white opacity-90 group-hover:scale-90 transition-transform shadow-inner"></div>
                  )}
                </div>
              </button>
              
              <div className="w-16 h-16"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-12 text-center">
             <button onClick={startCamera} className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-full shadow-2xl transition-all uppercase tracking-widest text-sm active:scale-95">
               Initialize Camera
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Scanner;
