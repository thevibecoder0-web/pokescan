
import { createWorker } from 'tesseract.js';

let worker: any = null;

// Standard Levenshtein Distance for fuzzy string matching (Non-AI)
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
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree", "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran", "Nidorina", "Nidoqueen", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag", "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout", "Weepinbell", "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", "Magnemite", "Magneton", "Farfetch'd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", "Starmie", "Mr. Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", "Mew"
];

export const extractNameLocally = async (canvas: HTMLCanvasElement): Promise<string | null> => {
    try {
        if (!worker) {
            worker = await createWorker('eng');
        }

        const cropCanvas = document.createElement('canvas');
        const ctx = cropCanvas.getContext('2d');
        if (!ctx) return null;

        // Pokémon name is usually in the top ~12% of the card
        // This reduces noise from card art and text descriptions
        const cropHeight = canvas.height * 0.12;
        const cropWidth = canvas.width * 0.8;
        const startX = canvas.width * 0.1;
        const startY = canvas.height * 0.05;

        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        
        // Apply high-contrast filter for OCR
        ctx.filter = 'grayscale(100%) contrast(150%)';
        ctx.drawImage(canvas, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        const { data: { text } } = await worker.recognize(cropCanvas);
        
        const lines = text.split('\n');
        for (const line of lines) {
            const words = line.trim().split(/\s+/);
            for (const word of words) {
                const cleanWord = word.replace(/[^a-zA-Z]/g, '');
                if (cleanWord.length < 3) continue;

                // Fuzzy match against dictionary to handle minor OCR errors
                for (const species of POKEMON_SPECIES) {
                    const dist = getLevenshteinDistance(cleanWord.toLowerCase(), species.toLowerCase());
                    if (dist <= 1 || (cleanWord.length > 7 && dist <= 2)) {
                        return species;
                    }
                }
            }
        }
    } catch (error) {
        console.error("Local OCR Error:", error);
    }
    return null;
};
