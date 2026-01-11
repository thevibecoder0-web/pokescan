
import { createWorker } from 'tesseract.js';

let worker: any = null;
let initPromise: Promise<void> | null = null;

export interface OCRResult {
  name: string;
  number: string;
  fullText: string;
  confidence: number;
}

// Highly optimized Levenshtein for real-time performance
const fastLevenshtein = (s1: string, s2: string): number => {
  if (s1 === s2) return 0;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  let v0 = new Int32Array(len2 + 1);
  let v1 = new Int32Array(len2 + 1);
  for (let i = 0; i <= len2; i++) v0[i] = i;
  for (let i = 0; i < len1; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < len2; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= len2; j++) v0[j] = v1[j];
  }
  return v0[len2];
};

const POKEMON_SPECIES = [
  "Pikachu", "Charizard", "Blastoise", "Venusaur", "Mewtwo", "Mew", "Eevee", "Lugia", "Rayquaza", 
  "Gengar", "Dragonite", "Arcanine", "Lucario", "Greninja", "Mimikyu", "Milotic", "Squirtle", 
  "Bulbasaur", "Charmander", "Snorlax", "Lapras", "Ditto", "Gardevoir", "Sylveon", "Umbreon", 
  "Espeon", "Tyranitar", "Alakazam", "Machamp", "Ho-Oh", "Kyogre", "Groudon", "Dialga", "Palkia",
  "Giratina", "Arceus", "Zacian", "Zamazenta", "Koraidon", "Miraidon", "Terapagos", "Exeggcute",
  "Exeggutor", "Hoothoot", "Noctowl", "Shroomish", "Breloom", "Budew", "Roselia", "Roserade",
  "Cottonee", "Whimsicott", "Petilil", "Lilligant", "Maractus", "Deerling", "Sawsbuck", "Grubbin",
  "Charjabug", "Vikavolt", "Dwebble", "Crustle", "Morelull", "Shiinotic", "Zarude", "Scovillain",
  "Ponyta", "Rapidash", "Moltres", "Victini", "Larvesta", "Volcarona", "Charcadet", "Ceruledge",
  "Dialga", "Palkia", "Giratina", "Arceus", "Eternatus", "Urshifu", "Calyrex", "Enamorus", "Terapagos",
  "Pecharunt", "Iron Valiant", "Roaring Moon", "Walking Wake", "Iron Leaves", "Gouging Fire", "Raging Bolt"
];

export const initOCRWorker = async () => {
  if (worker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      worker = await createWorker('eng', 1, {
        logger: () => {},
        cacheMethod: 'readOnly',
      });
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -!',
        tessedit_pageseg_mode: '11', // Sparse text
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        tessedit_do_invert: '0', // Manual contrast control in scanner is better
      });
    } catch (err) {
      console.error("Neural Core Init Failure:", err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};

const cleanText = (text: string) => text.trim().replace(/[^a-zA-Z0-9/ ]/g, '').replace(/\s+/g, ' ');

export const extractCardTextLocally = async (imageCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initOCRWorker();
    if (!worker) return null;

    // TARGETED ROI STRATEGY
    // Pass 1: Focus on Name (Top 20%) and Number (Bottom 15%)
    // We execute one recognition call but analyze zones. 
    // Tesseract handles the whole image but we can provide hints or just filter the results.
    const { data: { text, confidence } } = await worker.recognize(imageCanvas);
    const rawText = cleanText(text);
    
    if (!rawText || rawText.length < 2) return null;

    let detectedName = "";
    let detectedNumber = "";

    // 1. REGEX PATTERNS FOR NUMBERS (High Precision)
    // Looking for formats like 036/191, 192/191, or even just digits if adjacent to "/"
    const numMatch = rawText.match(/(\d{1,3})\s?\/\s?(\d{1,3})/);
    if (numMatch) {
        detectedNumber = `${numMatch[1]}/${numMatch[2]}`;
    }

    // 2. FUZZY SPECIES MATCHING (Scoring based)
    const words = rawText.split(' ');
    let bestScore = 0.7; // Minimum confidence
    
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (cleanWord.length < 3) continue;
      
      for (const species of POKEMON_SPECIES) {
        const specLower = species.toLowerCase();
        // Strict match check first
        if (cleanWord === specLower) {
            detectedName = species;
            bestScore = 1.0;
            break;
        }
        
        // Fuzzy check
        const dist = fastLevenshtein(cleanWord, specLower);
        const similarity = 1 - dist / Math.max(cleanWord.length, specLower.length);
        
        if (similarity > bestScore) {
          bestScore = similarity;
          detectedName = species;
        }
      }
      if (bestScore === 1.0) break;
    }

    return {
      name: detectedName,
      number: detectedNumber,
      fullText: rawText,
      confidence: confidence
    };
  } catch (error) {
    console.error("Local Neural Parsing Error:", error);
    return null;
  }
};
