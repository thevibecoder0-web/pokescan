
import { createWorker } from 'tesseract.js';

let worker: any = null;

export interface OCRResult {
  name: string;
  number: string | null;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
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
 * Optimized Hybrid OCR for Pokemon Cards
 * 1. Focuses on top 18% (Name)
 * 2. Focuses on bottom 20% (Card Number)
 */
export const extractNameLocally = async (sourceCanvas: HTMLCanvasElement): Promise<OCRResult | null> => {
  try {
    await initWorker();

    const nameplateCanvas = document.createElement('canvas');
    const ctx = nameplateCanvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    const cropHeightName = Math.floor(sourceCanvas.height * 0.18);
    const cropHeightNumber = Math.floor(sourceCanvas.height * 0.20);
    const cropWidth = sourceCanvas.width;
    
    // We combine both zones into one "stripline" to minimize recognition calls
    nameplateCanvas.width = cropWidth;
    nameplateCanvas.height = cropHeightName + cropHeightNumber;

    ctx.filter = 'grayscale(1) contrast(1.6)';
    
    // Draw Name Zone (Top)
    ctx.drawImage(
      sourceCanvas, 
      0, 0, sourceCanvas.width, cropHeightName,
      0, 0, cropWidth, cropHeightName
    );

    // Draw Number Zone (Bottom)
    ctx.drawImage(
      sourceCanvas,
      0, sourceCanvas.height - cropHeightNumber, sourceCanvas.width, cropHeightNumber,
      0, cropHeightName, cropWidth, cropHeightNumber
    );

    const { data } = await worker.recognize(nameplateCanvas);
    
    let detectedName: string | null = null;
    let detectedNumber: string | null = null;
    let nameBbox: any = null;

    for (const word of data.words) {
      const text = word.text.trim();
      
      // Look for Card Number Patterns (e.g., 123/191 or 036)
      if (!detectedNumber) {
        const numMatch = text.match(/(\d{1,3}\/\d{1,3})|(\d{3})/);
        if (numMatch) {
          detectedNumber = numMatch[0];
        }
      }

      // Look for Pokemon Name
      if (!detectedName) {
        const cleanWord = text.replace(/[^a-zA-Z]/g, '');
        if (cleanWord.length >= 3) {
          for (const species of POKEMON_SPECIES) {
            const dist = getLevenshteinDistance(cleanWord.toLowerCase(), species.toLowerCase());
            const isMatch = (cleanWord.length <= 4 && dist === 0) || (cleanWord.length > 4 && dist <= 1);
            if (isMatch) {
              detectedName = species;
              nameBbox = {
                x0: word.bbox.x0,
                y0: word.bbox.y0,
                x1: word.bbox.x1,
                y1: word.bbox.y1
              };
              break;
            }
          }
        }
      }
    }
    
    if (detectedName) {
      return {
        name: detectedName,
        number: detectedNumber,
        bbox: nameBbox
      };
    }
    
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};
