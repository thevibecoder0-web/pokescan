
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

export interface OCRResult {
  name: string;
  number: string;
  strategyUsed: string;
}

// Low-level helper for fuzzy matching
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, () => 
    Array.from({ length: b.length + 1 }, (_, i) => i)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

const POKEMON_SPECIES = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Pikachu", "Raichu", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Mewtwo", "Mew", "Lugia", "Ho-Oh", "Rayquaza", "Kyogre", "Groudon", "Lucario", "Greninja", "Mimikyu", "Eternatus", "Zacian", "Zamazenta", "Koraidon", "Miraidon", "Terapagos", "Milotic", "Gengar", "Dragonite", "Arcanine", "Lapras", "Snorlax", "Ditto", "Gardevoir", "Sylveon", "Umbreon", "Espeon"
];

export const initOCRWorker = async () => {
  if (worker || isInitializing) return;
  isInitializing = true;
  try {
    worker = await createWorker('eng');
  } catch (err) {
    console.error("Worker Initialization Failed", err);
  } finally {
    isInitializing = false;
  }
};

const cleanText = (text: string) => {
  return text.trim().replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ');
};

/**
 * Enhanced OCR extractor that processes name and number regions separately with specialized filters.
 */
export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    if (!worker) await initOCRWorker();
    
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // Defined sectors on the warped 400x560 canvas
    const nameRegion = { x: w * 0.05, y: h * 0.02, w: w * 0.70, h: h * 0.09 };
    const numRegion = { x: w * 0.02, y: h * 0.88, w: w * 0.40, h: h * 0.10 };

    const getSegmentText = async (region: {x: number, y: number, w: number, h: number}, whitelist: string) => {
      const segCanvas = document.createElement('canvas');
      segCanvas.width = region.w * 3; // Upscale significantly for Tesseract
      segCanvas.height = region.h * 3;
      const ctx = segCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return "";
      
      // Draw and upscale segment
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cardCanvas, region.x, region.y, region.w, region.h, 0, 0, segCanvas.width, segCanvas.height);
      
      // High-contrast binarization filter
      const imgData = ctx.getImageData(0, 0, segCanvas.width, segCanvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const grayscale = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        const threshold = 130; 
        const val = grayscale > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);

      await worker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: '7', // Single line
      });

      const { data: { text } } = await worker.recognize(segCanvas);
      return cleanText(text);
    };

    // Run OCR on segments
    const rawName = await getSegmentText(nameRegion, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -');
    const rawNum = await getSegmentText(numRegion, '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZ');

    if (!rawName && !rawNum) return null;

    let detectedName = "";
    // Fuzzy matching for name
    const words = rawName.split(' ');
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length < 3) continue;
      
      const exact = POKEMON_SPECIES.find(s => s.toLowerCase() === cleanWord.toLowerCase());
      if (exact) {
        detectedName = exact;
        break;
      }
      
      const fuzzy = POKEMON_SPECIES.find(species => getLevenshteinDistance(cleanWord.toLowerCase(), species.toLowerCase()) <= 1);
      if (fuzzy) {
        detectedName = fuzzy;
        break;
      }
    }

    if (!detectedName && rawName.length > 2) {
      detectedName = rawName.replace(/[^a-zA-Z]/g, '');
    }

    // Clean up number (looking for 001/191 or similar)
    const numMatch = rawNum.match(/(\d{1,3}\/\d{1,3})|([A-Z0-9]{2,5}\s?\d{1,3})/i);
    const detectedNumber = numMatch ? numMatch[0] : (rawNum.length > 0 ? rawNum : "???");

    if (detectedName.length > 2 || detectedNumber !== "???") {
      return {
        name: detectedName || "Unknown Asset",
        number: detectedNumber,
        strategyUsed: "TESSERACT_SEGMENT_ANALYSIS"
      };
    }
    
    return null;
  } catch (error) {
    console.error("OCR Local Error", error);
    return null;
  }
};
