
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a professional Pokémon TCG expert. 
Your task is to find the exact official data for a Pokémon card based on a user's input (name and number or image).
Return the data in a strict JSON format matching the schema provided. 
Use Google Search grounding to ensure accuracy against official TCG sources like TCGPlayer, Pokemon.com, or Bulbapedia.
Crucially, find a direct URL to the official card art image (usually from pokemon.com or tcgplayer assets).`;

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
              text: "Perform a deep lookup for this Pokémon TCG card. Use the card name, set symbol/name, and card number visible in the image to find the official card data. I need: official name, set name, card number, HP (Health Points), Pokémon type, a list of all abilities, a list of all attacks, and a direct URL to the official card art image.",
            },
          ],
        },
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
      },
    });

    const text = response.text;
    if (!text) return null;

    const result = JSON.parse(text) as IdentificationResult;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

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
      model: "gemini-3-flash-preview",
      contents: `Search for the official Pokémon TCG card data for: "${query}". Provide details including name, set, card number, HP, type, abilities, attacks, and a direct URL to the official card image from a TCG database.`,
      config: {
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
      },
    });

    const text = response.text;
    if (!text) return null;

    const result = JSON.parse(text) as IdentificationResult;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Error looking up card manually:", error);
    return null;
  }
};
