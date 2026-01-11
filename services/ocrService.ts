
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

const POKEMON_SPECIES = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree", "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran", "Nidorina", "Nidoqueen", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew",
  "Chikorita", "Bayleef", "Meganium", "Cyndaquil", "Quilava", "Typhlosion", "Totodile", "Croconaw", "Feraligatr", "Sentret", "Furret", "Hoothoot", "Noctowl", "Ledyba", "Ledian", "Spinarak", "Ariados", "Crobat", "Chinchou", "Lanturn", "Pichu", "Cleffa", "Igglybuff", "Togepi", "Togetic", "Natu", "Xatu", "Mareep", "Flaaffy", "Ampharos", "Bellossom", "Marill", "Azumarill", "Sudowoodo", "Politoed", "Hoppip", "Skiploom", "Jumpluff", "Aipom", "Sunkern", "Sunflora", "Yanma", "Wooper", "Quagsire", "Espeon", "Umbreon", "Murkrow", "Slowking", "Misdreavus", "Unown", "Wobbuffet", "Girafarig", "Pineco", "Forretress", "Dunsparce", "Gligar", "Steelix", "Scizor", "Shuckle", "Heracross", "Sneasel", "Teddiursa", "Ursaring", "Slugma", "Magcargo", "Swinub", "Piloswine", "Corsola", "Remoraid", "Octillery", "Delibird", "Mantine", "Skarmory", "Houndour", "Houndoom", "Kingdra", "Phanpy", "Donphan", "Porygon2", "Stantler", "Smeargle", "Tyrogue", "Hitmontop", "Smoochum", "Elekid", "Magby", "Miltank", "Blissey", "Raikou", "Entei", "Suicune", "Larvitar", "Pupitar", "Tyranitar", "Lugia", "Ho-Oh", "Celebi"
];

const initWorker = async () => {
  if (worker) return;
  worker = await createWorker('eng');
};

/**
 * NEURAL EXTRACTION:
 * Since input is a normalized 400x560 warped card, we use hard-coded
 * geographic regions for maximum speed.
 */
export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initWorker();
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // Region 1: Name Bar (Top Left)
    // Region 2: Number Area (Bottom Left/Right)
    const regions = [
      { x: w * 0.05, y: h * 0.02, w: w * 0.65, h: h * 0.12 }, // Name
      { x: 0, y: h * 0.85, w: w, h: h * 0.15 } // Number band
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
    const nameRegionHeight = regions[0].h;

    for (const word of data.words) {
      const text = word.text.trim();
      const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;

      // Check Name (Top Region)
      if (!detectedName && yCenter < nameRegionHeight) {
        const cleanWord = text.replace(/[^a-zA-Z]/g, '');
        if (cleanWord.length >= 3) {
          for (const species of POKEMON_SPECIES) {
            const dist = getLevenshteinDistance(cleanWord, species);
            if (dist <= (species.length > 5 ? 2 : 1)) {
              detectedName = species;
              break;
            }
          }
        }
      }

      // Check Number (Bottom Region)
      if (!detectedNumber && yCenter > nameRegionHeight) {
        const slashMatch = text.match(/([A-Z0-9-]{1,6}\/\d{1,3})/i);
        const standaloneMatch = text.match(/\b\d{3,4}\b/);
        const potentialNum = slashMatch?.[0] || standaloneMatch?.[0];
        if (potentialNum) detectedNumber = potentialNum;
      }
    }

    if (detectedName && detectedNumber) {
      return {
        name: detectedName,
        number: detectedNumber,
        bbox: null,
        strategyUsed: "PERSPECTIVE_LOCKED"
      };
    }
    
    return null;
  } catch (error) {
    console.error("Neural OCR Error:", error);
    return null;
  }
};
