
import { createWorker } from 'tesseract.js';

let worker: any = null;

/**
 * Initializes the OCR engine with specific parameters for TCG text.
 */
export const initOCR = async () => {
  if (!worker) {
    worker = await createWorker('eng');
    // Configure worker to expect single words/short lines to reduce hallucination
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -',
      tessedit_pageseg_mode: '7', // Treat the image as a single text line
    });
  }
  return worker;
};

/**
 * Pre-processes a canvas context to improve OCR legibility.
 * Converts to grayscale and boosts contrast.
 */
const preprocessForOCR = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Grayscale conversion
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    // Boost contrast: push values towards 0 or 255
    const threshold = 128;
    const contrast = avg > threshold ? 255 : 0;
    
    data[i] = contrast;     // R
    data[i + 1] = contrast; // G
    data[i + 2] = contrast; // B
  }
  ctx.putImageData(imageData, 0, 0);
};

export const extractNameLocally = async (canvas: HTMLCanvasElement): Promise<string | null> => {
  try {
    const w = await initOCR();
    
    // Create a specialized crop for the Name Bar (Top Left)
    const cropCanvas = document.createElement('canvas');
    const cropWidth = Math.floor(canvas.width * 0.65); // 65% of card width
    const cropHeight = Math.floor(canvas.height * 0.15); // Top 15% of card height
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    
    const cropCtx = cropCanvas.getContext('2d', { alpha: false });
    if (!cropCtx) return null;

    // Draw just the top-left portion
    cropCtx.drawImage(canvas, 0, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // Apply contrast filters to remove background art noise
    preprocessForOCR(cropCtx, cropWidth, cropHeight);
    
    const { data: { text } } = await w.recognize(cropCanvas);
    
    // Clean up results
    const cleaned = text
      .split('\n')[0] // Only take the first line
      .replace(/[^a-zA-Z\s-]/g, '') // Remove everything but letters, spaces, and hyphens
      .trim();

    // Pokemon names are usually at least 3 chars (Mew)
    if (cleaned.length >= 3) {
      // Basic common error correction (Tesseract often sees 'ex' as 'ox')
      return cleaned.replace(/\box\b/gi, 'ex');
    }
    
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
