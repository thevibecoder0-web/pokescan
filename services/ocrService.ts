
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

export interface OCRResult {
  name: string;
  number: string;
  fullText: string;
  confidence: number;
}

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
  "Ditto", "Gardevoir", "Sylveon", "Umbreon", "Espeon", "Tyranitar", "Scizor", "Alakazam", "Machamp",
  "Arceus", "Dialga", "Palkia", "Giratina", "Darkrai", "Cresselia", "Heatran", "Regigigas", "Manaphy",
  "Zeraora", "Marshadow", "Meltan", "Melmetal", "Garchomp", "Salamence", "Metagross", "Hydreigon", "Goodra",
  "Kommo-o", "Dragapult", "Baxcalibur", "Roaring Moon", "Iron Valiant", "Iron Hands", "Flutter Mane",
  "Centiskorch", "Orbeetle", "Drednaw", "Coalossal", "Appletun", "Flapple", "Toxtricity", "Sandaconda", "Grimmsnarl"
];

export const initOCRWorker = async () => {
  if (worker || isInitializing) return;
  isInitializing = true;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -!',
      tessedit_pageseg_mode: '3', 
      tessjs_create_hocr: '0',
      tessjs_create_tsv: '0',
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

export const extractAllCardText = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    if (!worker) await initOCRWorker();
    
    const ctx = cardCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    
    const width = cardCanvas.width;
    const height = cardCanvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Softened preprocessing: just grayscale and simple contrast
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      data[i] = data[i+1] = data[i+2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);

    const { data: { text, confidence } } = await worker.recognize(cardCanvas);
    const fullText = cleanText(text);
    
    if (!fullText || fullText.length < 4) return null;

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

    const numMatch = fullText.match(/(\d{1,3}\/\d{1,3})/);
    const detectedNumber = numMatch ? numMatch[0] : "???";

    return {
      name: detectedName || "Unidentified Asset",
      number: detectedNumber,
      fullText: fullText,
      confidence: confidence
    };
  } catch (error) {
    console.error("Global OCR Error", error);
    return null;
  }
};
