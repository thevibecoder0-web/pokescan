
import { createWorker } from 'tesseract.js';

let worker: any = null;
const SCAN_BUFFER_LIMIT = 5;
const nameBuffer: Map<string, number> = new Map();

/**
 * Initializes the OCR engine with optimized TCG parameters.
 */
export const initOCR = async () => {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -',
      tessedit_pageseg_mode: '7', // Single line mode for names
      tessedit_ocr_engine_mode: '1', // LSTM only for speed/accuracy balance
    });
  }
  return worker;
};

/**
 * Uses OpenCV.js (loaded in index.html) to perform professional-grade 
 * image normalization specifically for high-contrast text extraction.
 */
const preprocessWithOpenCV = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  if (!(window as any).cv) return canvas;
  const cv = (window as any).cv;

  try {
    let src = cv.imread(canvas);
    let dst = new cv.Mat();
    
    // 1. Grayscale
    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    
    // 2. Increase Contrast / Normalize
    cv.normalize(src, src, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
    
    // 3. Adaptive Thresholding (Crucial for handling different lighting)
    cv.adaptiveThreshold(src, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
    
    // 4. Denoising (Morphological opening)
    let M = cv.Mat.ones(2, 2, cv.CV_8U);
    cv.morphologyEx(dst, dst, cv.MORPH_OPEN, M);
    
    cv.imshow(canvas, dst);
    
    src.delete();
    dst.delete();
    M.delete();
  } catch (e) {
    console.warn("OpenCV Processing skipped:", e);
  }
  return canvas;
};

/**
 * High-accuracy normalization for TCG specific labels.
 */
const neuralCorrect = (text: string): string => {
  let cleaned = text
    .replace(/[|\[\]\(\)]/g, 'I')
    .replace(/\b1\b/g, 'I')
    .replace(/\b0\b/g, 'O')
    .replace(/[^a-zA-Z\s-]/g, '')
    .trim();

  // Fix common TCG suffix glitches
  return cleaned
    .replace(/\b[oO][xX]\b/gi, 'ex')
    .replace(/\bVmax\b/gi, 'VMAX')
    .replace(/\bVstar\b/gi, 'VSTAR')
    .replace(/\bGx\b/gi, 'GX')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Filters out low-confidence OCR "junk".
 */
const isLikelyPokemonName = (text: string): boolean => {
  if (text.length < 3 || text.length > 25) return false;
  // Check for nonsense repetitive chars (OCR glitch)
  if (/(.)\1\1/.test(text)) return false;
  // Ensure we have vowels (most names aren't pure consonants)
  const vowels = text.match(/[aeiouy]/gi);
  if (!vowels || vowels.length < 1) return false;
  return true;
};

/**
 * TEMPORAL VOTING SYSTEM
 * Instead of relying on a single frame, we scan continuously and keep a buffer.
 * We only "confirm" a name if it's seen consistently.
 */
export const extractNameLocally = async (canvas: HTMLCanvasElement): Promise<string | null> => {
  try {
    const w = await initOCR();
    
    // 1. Crop the Name Area (Top ~10%)
    const cropCanvas = document.createElement('canvas');
    const cropWidth = Math.floor(canvas.width * 0.55); 
    const cropHeight = Math.floor(canvas.height * 0.08);
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    
    const cropCtx = cropCanvas.getContext('2d', { alpha: false });
    if (!cropCtx) return null;

    const xOffset = Math.floor(canvas.width * 0.07);
    const yOffset = Math.floor(canvas.height * 0.045);

    cropCtx.drawImage(canvas, xOffset, yOffset, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // 2. Pro-grade Preprocessing
    preprocessWithOpenCV(cropCanvas);
    
    // 3. OCR Recognition
    const { data: { text, confidence } } = await w.recognize(cropCanvas);
    
    if (confidence < 40) return null; // Reject low confidence frames immediately

    const rawCandidate = text.split('\n')[0];
    const candidate = neuralCorrect(rawCandidate);

    if (isLikelyPokemonName(candidate)) {
      // 4. Temporal Buffer Logic
      const count = (nameBuffer.get(candidate) || 0) + 1;
      nameBuffer.set(candidate, count);

      // If we've seen this specific name 3 times in the current session
      if (count >= 3) {
        // Clear other names from buffer once we have a solid lock
        const final = candidate;
        nameBuffer.clear();
        return final;
      }
    } else {
      // Slowly decay buffer if we get junk
      nameBuffer.forEach((val, key) => {
        if (val > 0) nameBuffer.set(key, val - 0.5);
        if (val <= 0) nameBuffer.delete(key);
      });
    }
    
    return null;
  } catch (error) {
    console.error("Local Neural Scan Error:", error);
    return null;
  }
};
