
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

export interface OCRResult {
  name: string;
  number: string;
  fullText: string;
  confidence: number;
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
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", 
  "Pikachu", "Raichu", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Mewtwo", "Mew", "Lugia", "Ho-Oh", 
  "Rayquaza", "Kyogre", "Groudon", "Lucario", "Greninja", "Mimikyu", "Eternatus", "Zacian", "Zamazenta", 
  "Koraidon", "Miraidon", "Terapagos", "Milotic", "Gengar", "Dragonite", "Arcanine", "Lapras", "Snorlax", 
  "Ditto", "Gardevoir", "Sylveon", "Umbreon", "Espeon", "Tyranitar", "Scizor", "Alakazam", "Machamp"
];

export const initOCRWorker = async () => {
  if (worker || isInitializing) return;
  isInitializing = true;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -!',
      tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD.
    });
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
 * Global Card OCR: Scans the entire card for any and all text.
 */
export const extractAllCardText = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    if (!worker) await initOCRWorker();
    
    // Pre-processing: Scale up for better accuracy
    const offscreen = document.createElement('canvas');
    offscreen.width = cardCanvas.width * 2;
    offscreen.height = cardCanvas.height * 2;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cardCanvas, 0, 0, offscreen.width, offscreen.height);
    
    // Thresholding for text clarity
    const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const val = avg > 120 ? 255 : 0; // High contrast
      data[i] = data[i + 1] = data[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);

    const { data: { text, confidence } } = await worker.recognize(offscreen);
    const fullText = cleanText(text);
    
    if (!fullText || fullText.length < 3) return null;

    // Greedy Name Identification
    let detectedName = "";
    const words = fullText.split(' ');
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length < 3) continue;
      
      const match = POKEMON_SPECIES.find(s => 
        s.toLowerCase() === cleanWord.toLowerCase() || 
        getLevenshteinDistance(cleanWord.toLowerCase(), s.toLowerCase()) <= 1
      );
      
      if (match) {
        detectedName = match;
        break;
      }
    }

    // Attempt Number Extraction (e.g., 001/191)
    const numMatch = fullText.match(/(\d{1,3}\/\d{1,3})/);
    const detectedNumber = numMatch ? numMatch[0] : "???";

    return {
      name: detectedName || "Scanning Asset...",
      number: detectedNumber,
      fullText: fullText,
      confidence: confidence
    };
  } catch (error) {
    console.error("Global OCR Error", error);
    return null;
  }
};
