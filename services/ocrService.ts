
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

export interface OCRResult {
  name: string;
  number: string;
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

// Expanded dictionary for better fuzzy matching
const POKEMON_SPECIES = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree", "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran", "Nidorina", "Nidoqueen", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew",
  "Pichu", "Lugia", "Ho-Oh", "Celebi", "Rayquaza", "Kyogre", "Groudon", "Lucario", "Greninja", "Mimikyu", "Mew", "Eternatus", "Zacian", "Zamazenta", "Koraidon", "Miraidon", "Terapagos", "Milotic"
];

export const initOCRWorker = async () => {
  if (worker || isInitializing) return;
  isInitializing = true;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/ -',
      tessedit_pageseg_mode: '7', // Treat as a single line of text
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

export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    if (!worker) await initOCRWorker();
    
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // We define regions on the warped 400x560 canvas
    const nameRegion = { x: w * 0.05, y: h * 0.02, w: w * 0.65, h: h * 0.10 };
    const numRegion = { x: w * 0.02, y: h * 0.88, w: w * 0.40, h: h * 0.11 };

    const getSegmentText = async (region: {x: number, y: number, w: number, h: number}) => {
      const segCanvas = document.createElement('canvas');
      segCanvas.width = region.w * 2; // Upscale for Tesseract
      segCanvas.height = region.h * 2;
      const ctx = segCanvas.getContext('2d');
      if (!ctx) return "";
      
      // Draw and upscale
      ctx.drawImage(cardCanvas, region.x, region.y, region.w, region.h, 0, 0, segCanvas.width, segCanvas.height);
      
      // Basic image enrichment for OCR
      const imgData = ctx.getImageData(0, 0, segCanvas.width, segCanvas.height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const avg = (imgData.data[i] + imgData.data[i+1] + imgData.data[i+2]) / 3;
        const val = avg > 128 ? 255 : 0; // Simple threshold
        imgData.data[i] = val;
        imgData.data[i+1] = val;
        imgData.data[i+2] = val;
      }
      ctx.putImageData(imgData, 0, 0);

      const { data } = await worker.recognize(segCanvas);
      return cleanText(data.text);
    };

    const rawName = await getSegmentText(nameRegion);
    const rawNum = await getSegmentText(numRegion);

    if (!rawName && !rawNum) return null;

    let detectedName = "";
    // Fuzzy search for name
    const words = rawName.split(' ');
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length < 3) continue;
      
      const match = POKEMON_SPECIES.find(s => s.toLowerCase() === cleanWord.toLowerCase());
      if (match) {
        detectedName = match;
        break;
      }
      
      // Levenshtein fallback
      for (const species of POKEMON_SPECIES) {
        if (getLevenshteinDistance(cleanWord.toLowerCase(), species.toLowerCase()) <= 1) {
          detectedName = species;
          break;
        }
      }
      if (detectedName) break;
    }

    // Default to raw if no fuzzy match but we have something
    if (!detectedName && rawName.length > 3) {
       detectedName = rawName.split(' ')[0].replace(/[^a-zA-Z]/g, '');
    }

    // Extract number pattern like 001/191 or SV8 001
    const numMatch = rawNum.match(/(\d{1,3}\/\d{1,3})|([A-Z0-9]{2,5}\s?\d{1,3})/i);
    const detectedNumber = numMatch ? numMatch[0] : (rawNum.length > 0 ? rawNum : "???");

    if (detectedName.length > 2 || detectedNumber !== "???") {
      return {
        name: detectedName || "Scanning...",
        number: detectedNumber,
        strategyUsed: "MULTI_SEGMENT_OCR"
      };
    }
    
    return null;
  } catch (error) {
    console.error("OCR Local Error", error);
    return null;
  }
};
