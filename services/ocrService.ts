
import { createWorker } from 'tesseract.js';

let worker: any = null;

/**
 * Initializes the OCR engine with specific parameters for TCG text.
 */
export const initOCR = async () => {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -',
      tessedit_pageseg_mode: '7', // Treat as a single text line
    });
  }
  return worker;
};

/**
 * Enhanced binarization for OCR.
 * Uses a sharp thresholding to eliminate background gradients and holofoil noise.
 */
const preprocessForOCR = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Calculate average brightness
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgBrightness = totalBrightness / (data.length / 4);

  // Pokemon card names are typically dark on light backgrounds (except some special sets)
  // We want to maximize the contrast of the text.
  // We'll use a slightly aggressive threshold.
  const threshold = avgBrightness < 128 ? avgBrightness + 10 : avgBrightness - 15;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Simple grayscale
    const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    // Binarize
    const res = v > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = res;
  }
  ctx.putImageData(imageData, 0, 0);
};

/**
 * Corrects common OCR misidentifications.
 */
const normalizeOCRText = (text: string): string => {
  return text
    .replace(/\b1\b/g, 'I')
    .replace(/\b0\b/g, 'O')
    .replace(/\|/g, 'I')
    .replace(/\[/g, 'I')
    .replace(/\]/g, 'I')
    .replace(/[^a-zA-Z\s-]/g, '') // Final strip of anything non-alpha
    .trim();
};

/**
 * Validates if the string 'looks' like a Pokemon name.
 * Rejects high-noise strings and garbage OCR results.
 */
const isValidNameHeuristic = (text: string): boolean => {
  if (text.length < 3 || text.length > 30) return false;
  
  // Names usually start with a Capital letter (OCR might miss it, but worth checking pattern)
  const words = text.split(' ');
  
  // Too many short fragments? Probably noise.
  if (words.length > 5) return false;
  
  // Does it contain a high ratio of vowels? (Gibberish usually doesn't)
  const vowelCount = (text.match(/[aeiouy]/gi) || []).length;
  if (vowelCount === 0 || vowelCount / text.length < 0.15) return false;

  // Check for common suffixes/patterns
  const isSpecial = /\b(ex|GX|VMAX|V|VSTAR|Star)\b/i.test(text);
  
  // Mostly alphabetic check
  if (!/^[A-Za-z\s-]+$/.test(text)) return false;

  // Check for nonsense repetitive chars (OCR glitch)
  if (/(.)\1\1/.test(text)) return false;

  return true;
};

export const extractNameLocally = async (canvas: HTMLCanvasElement): Promise<string | null> => {
  try {
    const w = await initOCR();
    
    // Region of Interest: Top left where the name is located
    // Pokemon names are always in the top bar.
    const cropCanvas = document.createElement('canvas');
    // Most names are in the left 60% of the top bar
    const cropWidth = Math.floor(canvas.width * 0.58); 
    const cropHeight = Math.floor(canvas.height * 0.10); // Very narrow strip for just the name
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    
    const cropCtx = cropCanvas.getContext('2d', { alpha: false });
    if (!cropCtx) return null;

    // Offset slightly from the very edge where artifacts occur
    const xOffset = Math.floor(canvas.width * 0.06);
    const yOffset = Math.floor(canvas.height * 0.04);

    cropCtx.drawImage(canvas, 
      xOffset, yOffset, 
      cropWidth, cropHeight, 
      0, 0, cropWidth, cropHeight
    );
    
    preprocessForOCR(cropCtx, cropWidth, cropHeight);
    
    const { data: { text } } = await w.recognize(cropCanvas);
    
    // Process the text
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Take the best line (usually the first)
    let candidate = normalizeOCRText(lines[0]);

    if (isValidNameHeuristic(candidate)) {
      // Final cosmetic cleanup
      return candidate
        .replace(/\b[oO][xX]\b/gi, 'ex') // Fix 'ox' -> 'ex'
        .replace(/\bVstar\b/gi, 'VSTAR')
        .replace(/\bVmax\b/gi, 'VMAX')
        .trim();
    }
    
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
