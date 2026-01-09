
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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      const result = await identifyPokemonCard(base64Image);

      if (result && result.name && result.name.toLowerCase() !== 'unknown') {
        const newCard: PokemonCard = {
          id: Math.random().toString(36).substr(2, 9),
          ...result,
          scanDate: new Date().toLocaleDateString(),
          imageUrl: `https://picsum.photos/seed/${result.name}/400/600` // Placeholder logic
        };
        onCardDetected(newCard);
        setIsScanning(false);
      }
    }
    setLoading(false);
  }, [loading, onCardDetected, setIsScanning]);

  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-2xl shadow-2xl bg-black border-4 border-slate-800">
      {isScanning ? (
        <div className="relative aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          
          {/* Scanning Overlay (Red Border) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`relative w-[70%] aspect-[2.5/3.5] border-4 ${loading ? 'border-yellow-400 animate-pulse' : 'border-red-600'} transition-colors duration-300 rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.5)]`}>
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap">
                {loading ? 'Analyzing...' : 'Align Card Within Frame'}
              </div>
              
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-md"></div>
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-md"></div>
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-md"></div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-md"></div>
              
              {/* Scanning line effect */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500/50 shadow-[0_0_10px_#ef4444] animate-[scan_2s_linear_infinite]"></div>
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
            <button
              onClick={captureFrame}
              disabled={loading}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white font-bold rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Scanning...
                </>
              ) : (
                'Capture Card'
              )}
            </button>
            <button
              onClick={() => setIsScanning(false)}
              className="px-6 py-3 bg-slate-800/80 hover:bg-slate-700 text-white font-semibold rounded-full backdrop-blur-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="aspect-[4/3] flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8 text-center">
          <div className="w-20 h-20 mb-4 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700">
             <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Scanner Offline</h3>
          <p className="max-w-xs mb-6">Point your camera at a Pokémon card to identify and add it to your collection.</p>
          <button
            onClick={() => setIsScanning(true)}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg transition-all"
          >
            Start Scanning
          </button>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      
      <style>{`
        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

export default Scanner;
