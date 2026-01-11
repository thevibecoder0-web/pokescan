
import { createWorker } from 'tesseract.js';

let worker: any = null;
let isInitializing = false;

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

const POKEMON_SPECIES = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree", "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran", "Nidorina", "Nidoqueen", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew",
  "Chikorita", "Bayleef", "Meganium", "Cyndaquil", "Quilava", "Typhlosion", "Totodile", "Croconaw", "Feraligatr", "Sentret", "Furret", "Hoothoot", "Noctowl", "Ledyba", "Ledian", "Spinarak", "Ariados", "Crobat", "Chinchou", "Lanturn", "Pichu", "Cleffa", "Igglybuff", "Togepi", "Togetic", "Natu", "Xatu", "Mareep", "Flaaffy", "Ampharos", "Bellossom", "Marill", "Azumarill", "Sudowoodo", "Politoed", "Hoppip", "Skiploom", "Jumpluff", "Aipom", "Sunkern", "Sunflora", "Yanma", "Wooper", "Quagsire", "Espeon", "Umbreon", "Murkrow", "Slowking", "Misdreavus", "Unown", "Wobbuffet", "Girafarig", "Pineco", "Forretress", "Dunsparce", "Gligar", "Steelix", "Scizor", "Shuckle", "Heracross", "Sneasel", "Teddiursa", "Ursaring", "Slugma", "Magcargo", "Swinub", "Piloswine", "Corsola", "Remoraid", "Octillery", "Delibird", "Mantine", "Skarmory", "Houndour", "Houndoom", "Kingdra", "Phanpy", "Donphan", "Porygon2", "Stantler", "Smeargle", "Tyrogue", "Hitmontop", "Smoochum", "Elekid", "Magby", "Miltank", "Blissey", "Raikou", "Entei", "Suicune", "Larvitar", "Pupitar", "Tyranitar", "Lugia", "Ho-Oh", "Celebi"
];

export const initOCRWorker = async () => {
  if (worker || isInitializing) return;
  isInitializing = true;
  try {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/',
      tessjs_create_hocr: '0',
      tessjs_create_tsv: '0',
      tessedit_pageseg_mode: '6', 
    });
  } catch (err) {
    console.error("Worker Initialization Failed", err);
  } finally {
    isInitializing = false;
  }
};

export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    if (!worker) await initOCRWorker();
    
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // Standard TCG regions for warped 400x560 image
    const regions = [
      { x: w * 0.04, y: h * 0.025, w: w * 0.68, h: h * 0.11 }, // Name Bar (Increased height for multi-line or large fonts)
      { x: w * 0.02, y: h * 0.86, w: w * 0.48, h: h * 0.12 }  // Number/Set Area
    ];

    const scanCanvas = document.createElement('canvas');
    const sCtx = scanCanvas.getContext('2d');
    if (!sCtx) return null;

    const rH = regions[0].h;
    const pad = 15;
    scanCanvas.width = w;
    scanCanvas.height = (rH + pad) * regions.length;
    sCtx.fillStyle = 'white';
    sCtx.fillRect(0, 0, scanCanvas.width, scanCanvas.height);

    regions.forEach((r, i) => {
      sCtx.drawImage(cardCanvas, r.x, r.y, r.w, r.h, 0, i * (rH + pad), r.w, r.h);
    });

    const { data } = await worker.recognize(scanCanvas);
    
    let detectedName: string | null = null;
    let detectedNumber: string | null = null;
    const splitY = scanCanvas.height / 2;

    for (const word of data.words) {
      const text = word.text.trim();
      if (text.length < 3) continue;

      const yMid = (word.bbox.y0 + word.bbox.y1) / 2;

      // Identify Name
      if (!detectedName && yMid < splitY) {
        // Cleaning name artifacts
        const cleanName = text.replace(/[^a-zA-Z]/g, '');
        if (cleanName.length >= 3) {
          // Priority 1: Exact Match
          const exact = POKEMON_SPECIES.find(s => s.toLowerCase() === cleanName.toLowerCase());
          if (exact) {
            detectedName = exact;
          } else {
            // Priority 2: Fuzzy Match
            for (const species of POKEMON_SPECIES) {
              const dist = getLevenshteinDistance(cleanName, species);
              if (dist <= (species.length > 6 ? 2 : 1)) {
                detectedName = species;
                break;
              }
            }
          }
        }
      }

      // Identify Card Number
      if (!detectedNumber && yMid >= splitY) {
        // Match standard formats: 001/191 or just 001 or PROMO-001
        const numMatch = text.match(/([A-Z0-9-]{1,6}\/\d{1,3})|(\d{3,4})|([A-Z]{1,2}\d{1,3})/i);
        if (numMatch) detectedNumber = numMatch[0];
      }
      
      if (detectedName && detectedNumber) break;
    }

    if (detectedName && detectedNumber) {
      return {
        name: detectedName,
        number: detectedNumber,
        bbox: null,
        strategyUsed: "TURBO_PRECISION_CROP"
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
};
