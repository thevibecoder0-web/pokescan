
import { GoogleGenAI } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a world-class Pokémon TCG historian and database specialist. 
Your primary goal is to provide official card data.
When asked to identify or look up a card:
1. Use Google Search to find the EXACT match on TCGPlayer, Pokemon.com, or Bulbapedia.
2. Provide the official name, set name, card number, rarity, and type.
3. Crucially, find the direct URL to the high-resolution official card art.
4. RETURN THE DATA IN A CLEAR JSON BLOCK within your response.

Format your response exactly like this:
{
  "name": "Card Name",
  "set": "Set Name",
  "rarity": "Rarity",
  "type": "Fire/Water/etc",
  "number": "123/456",
  "hp": "120 HP",
  "imageUrl": "https://example.com/art.jpg",
  "abilities": ["Ability 1"],
  "attacks": [{"name": "Attack", "damage": "30", "description": "Desc"}]
}`;

const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Extracts a JSON object from a string that may contain other text.
 */
const extractJson = (text: string) => {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return null;
  } catch (e) {
    console.error("JSON parsing failed", e);
    return null;
  }
};

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
              text: "Identify this Pokémon TCG card. Use your search tool to find its official database entry and image URL. Return the JSON block.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) return null;

    const result = extractJson(text) as IdentificationResult;
    if (!result) return null;

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
      contents: `Look up official TCG data for: "${query}". Ensure you find a direct official image URL and include a JSON block in your response.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) return null;

    const result = extractJson(text) as IdentificationResult;
    if (!result) return null;

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.find(c => c.web?.uri)?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Error looking up card manually:", error);
    return null;
  }
};
