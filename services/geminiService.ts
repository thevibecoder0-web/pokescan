
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a professional Pokemon TCG identification engine. 
Analyze the image or query provided.
1. Identify the card accurately (Name, Set, Number).
2. Use Google Search to find the current TCGPlayer Market Price (numeric USD).
3. Use Google Search to find a high-resolution, public image URL for this specific card (e.g., from images.pokemontcg.io or tcgplayer).
4. Accuracy is critical. Accuracy > 99%.

Response must be strictly JSON.`;

// Use standard generateContent with Google Search tool
export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
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

    // Extract grounding source URL if available
    const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(c => c.web)?.web?.uri;

    const result = JSON.parse(response.text || '{}');
    if (!result.found) return null;
    return { ...result, sourceUrl } as IdentificationResult;
  } catch (error) {
    console.error("Gemini Ultra-Scan Error:", error);
    return null;
  }
};

/**
 * Perform manual lookup for a specific card using a text query.
 */
export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
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
  } catch (error) {
    console.error("Manual Lookup Error:", error);
    return null;
  }
};

/**
 * Fetch a list of cards belonging to a specific set using AI search grounding.
 */
export const fetchCardsFromSet = async (setName: string): Promise<IdentificationResult[]> => {
  try {
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
  } catch (error) {
    console.error("Fetch Set Error:", error);
    return [];
  }
};
