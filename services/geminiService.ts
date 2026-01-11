
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a professional Pokemon TCG identification engine. 
Analyze the image or query provided.
1. Identify the card accurately (Name, Set, Number).
2. Use Google Search to find the current TCGPlayer Market Price (numeric USD).
3. Use Google Search to find a high-resolution, public image URL for this specific card (e.g., from images.pokemontcg.io or tcgplayer).
4. Accuracy is critical. Accuracy > 99%.

Response must be strictly JSON.`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * World-class retry wrapper with exponential backoff.
 * Handles Rate Limits (429) and Transient Server Errors (5xx).
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errorMessage = err.message || String(err);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      const isServerError = errorMessage.includes("500") || errorMessage.includes("503");
      
      if ((isQuotaError || isServerError) && i < maxRetries) {
        const waitTime = Math.pow(2, i) * 1500 + Math.random() * 500;
        console.warn(`[Gemini Engine] ${isQuotaError ? 'Quota Reached' : 'Server Error'}. Retrying (Attempt ${i + 1}/${maxRetries}) in ${Math.round(waitTime)}ms...`);
        await delay(waitTime);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Internal implementation of the identification logic
const identifyPokemonCardInternal = async (base64Image: string): Promise<IdentificationResult | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Identify this card, find its real-time market price, and provide a direct online high-res image URL." }
        ]
      }
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          set: { type: Type.STRING },
          number: { type: Type.STRING },
          rarity: { type: Type.STRING },
          marketPrice: { type: Type.NUMBER },
          imageUrl: { type: Type.STRING },
          found: { type: Type.BOOLEAN },
          type: { type: Type.STRING },
          hp: { type: Type.STRING },
          marketValue: { type: Type.STRING }
        },
        required: ["name", "found", "imageUrl", "marketPrice"]
      }
    }
  });

  const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(c => c.web)?.web?.uri;
  const result = JSON.parse(response.text || '{}');
  if (!result.found) return null;
  return { ...result, sourceUrl } as IdentificationResult;
};

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    return await withRetry(() => identifyPokemonCardInternal(base64Image));
  } catch (error) {
    console.error("Gemini Ultra-Scan Final Failure:", error);
    throw error; // Rethrow to be handled by the UI
  }
};

const manualCardLookupInternal = async (query: string): Promise<IdentificationResult | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ parts: [{ text: query }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          set: { type: Type.STRING },
          number: { type: Type.STRING },
          rarity: { type: Type.STRING },
          marketPrice: { type: Type.NUMBER },
          imageUrl: { type: Type.STRING },
          found: { type: Type.BOOLEAN },
          type: { type: Type.STRING },
          hp: { type: Type.STRING },
          marketValue: { type: Type.STRING }
        },
        required: ["name", "found", "imageUrl", "marketPrice"]
      }
    }
  });

  const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(c => c.web)?.web?.uri;
  const result = JSON.parse(response.text || '{}');
  if (!result.found) return null;
  return { ...result, sourceUrl } as IdentificationResult;
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    return await withRetry(() => manualCardLookupInternal(query));
  } catch (error) {
    console.error("Manual Lookup Final Failure:", error);
    throw error;
  }
};

export const fetchCardsFromSet = async (setName: string): Promise<IdentificationResult[]> => {
  try {
    return await withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: `Provide a list of 20 popular cards from the Pokemon set: ${setName}. Include metadata for each.` }] }],
        config: {
          systemInstruction: "You are a Pokemon TCG database. Return a list of card objects in JSON format.",
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                set: { type: Type.STRING },
                number: { type: Type.STRING },
                rarity: { type: Type.STRING },
                marketPrice: { type: Type.NUMBER },
                imageUrl: { type: Type.STRING },
                found: { type: Type.BOOLEAN },
                type: { type: Type.STRING },
                hp: { type: Type.STRING }
              },
              required: ["name", "number"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || '[]');
      return result as IdentificationResult[];
    });
  } catch (error) {
    console.error("Fetch Set Final Failure:", error);
    return [];
  }
};
