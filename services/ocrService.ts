
import { createWorker } from 'tesseract.js';

let worker: any = null;

export interface OCRResult {
  name: string;
  number: string;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  strategyUsed: string;
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

// Expanded to include iconic species from across all generations for high-accuracy matching
const POKEMON_SPECIES = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Pikachu", "Raichu", "Sandshrew", "Ninetales", "Jigglypuff", "Meowth", "Psyduck", "Arcanine", "Alakazam", "Machamp", "Gengar", "Gyaraods", "Lapras", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dragonite", "Mewtwo", "Mew",
  "Meganium", "Typhlosion", "Feraligatr", "Pichu", "Togepi", "Ampharos", "Marill", "Espeon", "Umbreon", "Scizor", "Heracross", "Tyranitar", "Lugia", "Ho-Oh", "Celebi",
  "Sceptile", "Blaziken", "Swampert", "Gardevoir", "Aggron", "Flygon", "Milotic", "Salamence", "Metagross", "Kyogre", "Groudon", "Rayquaza", "Jirachi", "Deoxys",
  "Torterra", "Infernape", "Empoleon", "Luxray", "Garchomp", "Lucario", "Abomasnow", "Dialga", "Palkia", "Giratina", "Darkrai", "Arceus",
  "Victini", "Snivy", "Tepig", "Oshawott", "Zoroark", "Haxorus", "Reshiram", "Zekrom", "Kyurem", "Keldeo", "Meloetta", "Genesect",
  "Chespin", "Fennekin", "Froakie", "Greninja", "Sylveon", "Xerneas", "Yveltal", "Zygarde", "Diancie", "Hoopa", "Volcanion",
  "Rowlet", "Litten", "Popplio", "Lycanroc", "Mimikyu", "Solgaleo", "Lunala", "Zeraora",
  "Grookey", "Scorbunny", "Sobble", "Corviknight", "Toxtricity", "Dragapult", "Zacian", "Zamazenta", "Eternatus",
  "Sprigatito", "Fuecoco", "Quaxly", "Ceruledge", "Armarouge", "Tinkaton", "Koraidon", "Miraidon", "Terapagos"
];

const initWorker = async () => {
  if (worker) return;
  worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -',
  });
};

export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initWorker();
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // Focused OCR Regions: Top 15% (Name) and Bottom 20% (Set Number)
    const regions = [
      { x: 0, y: 0, w: w * 0.75, h: h * 0.18, label: "NAME_ZONE" },
      { x: 0, y: h * 0.78, w: w, h: h * 0.22, label: "NUM_ZONE" }
    ];

    const scanCanvas = document.createElement('canvas');
    const sCtx = scanCanvas.getContext('2d');
    if (!sCtx) return null;

    const totalH = regions.reduce((acc, r) => acc + r.h, 0);
    scanCanvas.width = w;
    scanCanvas.height = totalH;

    let currentYOffset = 0;
    for (const r of regions) {
      sCtx.drawImage(cardCanvas, r.x, r.y, r.w, r.h, 0, currentYOffset, r.w, r.h);
      currentYOffset += r.h;
    }

    const { data } = await worker.recognize(scanCanvas);
    
    let detectedName: string | null = null;
    let detectedNumber: string | null = null;
    let nameBbox: any = null;

    const nameRegionHeight = regions[0].h;

    // Sort words by confidence and position
    for (const word of data.words) {
      if (word.confidence < 30) continue;

      const text = word.text.trim();
      const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;

      // 1. CARD NUMBER DETECTION (Bottom Region)
      if (!detectedNumber && yCenter > nameRegionHeight) {
        // Look for common patterns: XXX/XXX or XXX-XXX or simple digits
        const complexMatch = text.match(/([A-Z0-9-]{1,5}\/\d{1,3})/i);
        const simpleMatch = text.match(/\b\d{3,4}\b/);
        
        const candidate = complexMatch?.[0] || simpleMatch?.[0];
        if (candidate) {
          // Avoid HP misreads (usually at the top anyway, but double check)
          if (!text.toLowerCase().includes('hp')) {
            detectedNumber = candidate;
          }
        }
      }

      // 2. POKEMON NAME DETECTION (Top Region)
      if (!detectedName && yCenter < nameRegionHeight) {
        const cleanWord = text.replace(/[^a-zA-Z]/g, '');
        if (cleanWord.length >= 3) {
          // Check for exact or fuzzy match in the known species list
          for (const species of POKEMON_SPECIES) {
            const dist = getLevenshteinDistance(cleanWord, species);
            // Relaxed threshold for longer names, strict for short ones
            const threshold = species.length > 6 ? 2 : 1;
            
            if (dist <= threshold) {
              detectedName = species;
              nameBbox = word.bbox;
              break;
            }
          }
          
          // Fallback: If no fuzzy match, but the text looks like a valid proper noun
          if (!detectedName && cleanWord.length > 4 && word.confidence > 75) {
             detectedName = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
             nameBbox = word.bbox;
          }
        }
      }
    }

    if (detectedName && detectedNumber) {
      return {
        name: detectedName,
        number: detectedNumber,
        bbox: nameBbox,
        strategyUsed: "DUAL_ZONE_RECOGNITION"
      };
    }
    
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
