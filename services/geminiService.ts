
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are an expert Pokémon TCG assistant. 
Your goal is to provide official card data and a direct URL to the official card art image.
Use Google Search to verify the card details (Name, Set, Number, Rarity) against official sources like TCGPlayer or Pokemon.com.
Always return the data in the specified JSON format.`;

const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Returns a robust configuration for the Gemini API call.
 * We use a schema to ensure the output is always valid JSON.
 */
const getSafeConfig = () => ({
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
      imageUrl: { type: Type.STRING, description: "A direct URL to the official card image (from pokemon.com or tcgplayer)" },
      abilities: { type: Type.ARRAY, items: { type: Type.STRING } },
      attacks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            damage: { type: Type.STRING },
            description: { type: Type.STRING }
          }
        }
      }
    },
    // Only require the absolute essentials to prevent failure on Trainer/Energy cards
    required: ["name", "set", "number", "imageUrl"],
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
              text: "Identify this Pokémon TCG card from the image. Provide official name, set, number, and a direct URL to its official art image.",
            },
          ],
        },
      ],
      config: getSafeConfig() as any,
    });

    const result = JSON.parse(response.text) as IdentificationResult;
    
    // Extract grounding link for mandatory attribution
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.find(c => c.web?.uri)?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Card Identification Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Look up official TCG database details for: "${query}". Include a direct official image URL.`,
      config: getSafeConfig() as any,
    });

    const result = JSON.parse(response.text) as IdentificationResult;
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.find(c => c.web?.uri)?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Manual Lookup Error:", error);
    return null;
  }
};
