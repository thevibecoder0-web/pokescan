
import { createWorker } from 'tesseract.js';

let worker: any = null;
let initPromise: Promise<void> | null = null;

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
  "Pikachu", "Charizard", "Blastoise", "Venusaur", "Mewtwo", "Mew", "Eevee", "Lugia", "Rayquaza", 
  "Gengar", "Dragonite", "Arcanine", "Lucario", "Greninja", "Mimikyu", "Milotic", "Squirtle", 
  "Bulbasaur", "Charmander", "Snorlax", "Lapras", "Ditto", "Gardevoir", "Sylveon", "Umbreon", 
  "Espeon", "Tyranitar", "Alakazam", "Machamp", "Ho-Oh", "Kyogre", "Groudon", "Dialga", "Palkia",
  "Giratina", "Arceus", "Zacian", "Zamazenta", "Koraidon", "Miraidon", "Terapagos", "Exeggcute",
  "Exeggutor", "Hoothoot", "Noctowl", "Shroomish", "Breloom", "Budew", "Roselia", "Roserade",
  "Cottonee", "Whimsicott", "Petilil", "Lilligant", "Maractus", "Deerling", "Sawsbuck", "Grubbin",
  "Charjabug", "Vikavolt", "Dwebble", "Crustle", "Morelull", "Shiinotic", "Zarude", "Scovillain",
  "Ponyta", "Rapidash", "Moltres", "Victini", "Larvesta", "Volcarona", "Charcadet", "Ceruledge",
  "Dialga", "Palkia", "Giratina", "Arceus", "Eternatus", "Urshifu", "Calyrex", "Enamorus"
];

export const initOCRWorker = async () => {
  if (worker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      worker = await createWorker('eng', 1, {
        logger: () => {}, // Disable logging for max performance
      });
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -!',
        tessedit_pageseg_mode: '3', // Auto segmentation
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
      });
    } catch (err) {
      console.error("OCR Worker Init Failed", err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};

const cleanText = (text: string) => {
  return text.trim().replace(/[^a-zA-Z0-9/ ]/g, '').replace(/\s+/g, ' ');
};

/**
 * Optimized OCR process that looks specifically for the card name and set number
 */
export const extractCardTextLocally = async (imageCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initOCRWorker();
    if (!worker) return null;

    // Use a high-contrast version of the canvas
    const { data: { text, confidence } } = await worker.recognize(imageCanvas);
    const fullText = cleanText(text);
    
    if (!fullText || fullText.length < 2) return null;

    let detectedName = "";
    let detectedNumber = "";

    // 1. Precise Number Extraction (e.g. 123/191)
    const numMatch = fullText.match(/(\d{1,3})\s?\/\s?(\d{1,3})/);
    if (numMatch) {
        detectedNumber = `${numMatch[1]}/${numMatch[2]}`;
    }

    // 2. Fuzzy Name Extraction
    const words = fullText.split(' ');
    for (const word of words) {
      if (word.length < 3) continue;
      const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      
      const match = POKEMON_SPECIES.find(s => {
        const species = s.toLowerCase();
        return cleanWord.includes(species) || species.includes(cleanWord) || getLevenshteinDistance(cleanWord, species) <= 1;
      });
      
      if (match) {
        detectedName = match;
        break;
      }
    }

    return {
      name: detectedName,
      number: detectedNumber,
      fullText: fullText,
      confidence: confidence
    };
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
