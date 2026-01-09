
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a professional Pokémon TCG expert. 
Your task is to find the exact official data for a Pokémon card based on a user's input (name and number or image).
Return the data in a strict JSON format matching the schema provided. 
Use Google Search grounding to ensure accuracy against official TCG sources like TCGPlayer, Pokemon.com, or Bulbapedia.
Crucially, find a direct URL to the official card art image (usually from pokemon.com or tcgplayer assets).
If multiple matches exist, return the most common official release.`;

const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Common configuration for GenAI content generation
 */
const getBaseConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      set: { type: Type.STRING },
      rarity: { type: Type.STRING },
      type: { type: Type.STRING },
      number: { type: Type.STRING },
      hp: { type: Type.STRING },
      imageUrl: { type: Type.STRING, description: "Direct URL to official card image" },
      abilities: { type: Type.ARRAY, items: { type: Type.STRING } },
      attacks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            damage: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["name", "damage", "description"]
        }
      }
    },
    required: ["name", "set", "rarity", "type", "number", "hp", "abilities", "attacks", "imageUrl"],
  },
});

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: "Perform a deep lookup for this Pokémon TCG card. Use the card name, set symbol/name, and card number visible in the image to find the official card data. I need the official name, set, and a direct URL to the official card art.",
            },
          ],
        },
      ],
      config: getBaseConfig() as any,
    });

    if (!response.text) return null;

    const result = JSON.parse(response.text) as IdentificationResult;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.find(c => c.web?.uri)?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Error identifying card:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Find official TCG data for: "${query}". Include direct image URL and TCGPlayer details.`,
      config: getBaseConfig() as any,
    });

    if (!response.text) return null;

    const result = JSON.parse(response.text) as IdentificationResult;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.find(c => c.web?.uri)?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Error looking up card manually:", error);
    return null;
  }
};
