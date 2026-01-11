
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
 * Optimized Search Logic:
 * 1. PRIMARY: Top-Left (Name) + Bottom-Left (Number)
 * 2. ALTERNATE: Top-Left (Name) + Bottom-Right (Number)
 * 3. GLOBAL: Full Scan (Strictly checking spatial coordinates)
 */
export const extractNameLocally = async (cardCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initWorker();
    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // HP is typically at top-right (x > 70%, y < 15%). 
    // Card numbers are typically at bottom (y > 75%).
    const strategies = [
      { 
        name: "PRIMARY_LOCK", 
        regions: [
          { x: 0, y: 0, w: w * 0.7, h: h * 0.15 }, // Name bar (Exclude top-right HP area)
          { x: 0, y: h * 0.8, w: w * 0.45, h: h * 0.2 } // Bottom-left number
        ] 
      },
      { 
        name: "ALT_LOCK", 
        regions: [
          { x: 0, y: 0, w: w * 0.7, h: h * 0.15 }, // Name bar
          { x: w * 0.55, y: h * 0.8, w: w * 0.45, h: h * 0.2 } // Bottom-right number
        ] 
      },
      { 
        name: "FULL_SWEEP", 
        regions: [
          { x: 0, y: 0, w, h } // Full Card (Will use spatial filtering)
        ] 
      }
    ];

    for (const strategy of strategies) {
      const scanCanvas = document.createElement('canvas');
      const sCtx = scanCanvas.getContext('2d');
      if (!sCtx) continue;

      const totalH = strategy.regions.reduce((acc, r) => acc + r.h, 0);
      scanCanvas.width = w;
      scanCanvas.height = totalH;

      let currentYOffset = 0;
      for (const r of strategy.regions) {
        sCtx.drawImage(cardCanvas, r.x, r.y, r.w, r.h, 0, currentYOffset, r.w, r.h);
        currentYOffset += r.h;
      }

      const { data } = await worker.recognize(scanCanvas);
      
      let detectedName: string | null = null;
      let detectedNumber: string | null = null;
      let nameBbox: any = null;

      // Vertical threshold for the Name region in concatenated canvas
      const nameRegionHeight = strategy.regions[0].h;

      for (const word of data.words) {
        const text = word.text.trim();
        const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;
        const xCenter = (word.bbox.x0 + word.bbox.x1) / 2;

        // CARD NUMBER LOGIC
        if (!detectedNumber) {
          // Priority pattern: XXX/XXX
          const slashMatch = text.match(/([A-Z0-9-]{1,6}\/\d{1,3})/i);
          // Fallback pattern: standalone 3-4 digits
          const standaloneMatch = text.match(/\b\d{3,4}\b/);
          
          const potentialNum = slashMatch?.[0] || standaloneMatch?.[0];

          if (potentialNum) {
            let isValidPos = false;
            if (strategy.name === "FULL_SWEEP") {
              // In full sweep, number MUST be in the bottom 25% of the card
              if (yCenter > h * 0.75) isValidPos = true;
            } else {
              // In targeted strategies, the number is in the second concatenated region
              if (yCenter > nameRegionHeight) isValidPos = true;
            }

            if (isValidPos) {
              // One final check: HP is usually near the word "HP"
              const isHP = data.text.toLowerCase().includes(potentialNum.toLowerCase() + " hp") || 
                           data.text.toLowerCase().includes("hp " + potentialNum.toLowerCase());
              
              if (!isHP) {
                detectedNumber = potentialNum;
              }
            }
          }
        }

        // POKEMON NAME LOGIC
        if (!detectedName) {
          let isValidNamePos = false;
          if (strategy.name === "FULL_SWEEP") {
            // Name is in top 20% and usually on the left/center
            if (yCenter < h * 0.2 && xCenter < w * 0.8) isValidNamePos = true;
          } else {
            // Name is in first concatenated region
            if (yCenter < nameRegionHeight) isValidNamePos = true;
          }

          if (isValidNamePos) {
            const cleanWord = text.replace(/[^a-zA-Z]/g, '');
            if (cleanWord.length >= 3) {
              for (const species of POKEMON_SPECIES) {
                const dist = getLevenshteinDistance(cleanWord, species);
                if (dist <= (species.length > 5 ? 2 : 1)) {
                  detectedName = species;
                  nameBbox = word.bbox;
                  break;
                }
              }
            }
          }
        }
      }

      if (detectedName && detectedNumber) {
        return {
          name: detectedName,
          number: detectedNumber,
          bbox: nameBbox,
          strategyUsed: strategy.name
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
