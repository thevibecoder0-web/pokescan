
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
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      // For identification, we use a high-res shot
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const fullResImage = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      // For local storage preview, we resize to save space
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = 400;
      previewCanvas.height = 560;
      const previewCtx = previewCanvas.getContext('2d');
      if (previewCtx) {
        previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
      }
      const actualPhotoUrl = previewCanvas.toDataURL('image/jpeg', 0.7);

      const result = await identifyPokemonCard(fullResImage);

      if (result && result.name && result.name.toLowerCase() !== 'unknown') {
        const newCard: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          // Use the actual photo for the collection, fallback to official art if needed
          imageUrl: actualPhotoUrl || result.imageUrl
        };
        onCardDetected(newCard);
      } else {
        setError("Could not find official card data. Try a clearer shot.");
        setTimeout(() => setError(null), 3000);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl shadow-2xl bg-black border-2 border-slate-800 flex flex-col">
      <div className="relative aspect-[3/4] sm:aspect-video bg-slate-900 overflow-hidden">
        {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-600/90 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-xl animate-bounce backdrop-blur-sm">
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
              <div className={`relative w-[65%] sm:w-[30%] aspect-[2.5/3.5] border-2 transition-all duration-300 rounded-2xl ${
                  loading ? 'border-yellow-400 scale-105 shadow-[0_0_30px_rgba(250,204,21,0.4)]' : 'border-red-600/50 shadow-[0_0_20px_rgba(220,38,38,0.2)]'
              }`}>
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl opacity-80"></div>
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl opacity-80"></div>
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl opacity-80"></div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl opacity-80"></div>
                
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 whitespace-nowrap">
                  <span className="text-[10px] font-orbitron font-bold uppercase tracking-[0.2em] text-white">
                    {loading ? 'Performing Deep Lookup...' : 'Align Card for Database Scan'}
                  </span>
                </div>

                {!loading && (
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500/60 shadow-[0_0_15px_#ef4444] animate-[scan_2.5s_ease-in-out_infinite] rounded-full"></div>
                )}
              </div>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6 px-4">
              <button
                onClick={() => setIsScanning(false)}
                className="w-14 h-14 rounded-full bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all backdrop-blur-md"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>

              <button onClick={captureFrame} disabled={loading} className="group relative">
                <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
                    loading ? 'border-yellow-500 bg-yellow-500/20' : 'border-white bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                }`}>
                  {loading ? (
                    <svg className="animate-spin h-8 w-8 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white opacity-80 scale-100 group-hover:scale-90 transition-transform"></div>
                  )}
                </div>
              </button>
              <div className="w-14 h-14"></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-12 text-center">
             <button onClick={startCamera} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg transition-all">
               Grant Access
             </button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        @keyframes scan {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Scanner;
