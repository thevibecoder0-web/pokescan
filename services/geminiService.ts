
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    // Using googleSearch tool to "lookup" official data
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
              text: "Perform a deep lookup for this Pokémon TCG card. Use the card name, set symbol/name, and card number visible in the image to find the official card data. I need: official name, set name, card number, HP (Health Points), Pokémon type, a list of all abilities, and a list of all attacks with their damage values and descriptions. Be extremely precise and match official TCG database records.",
            },
          ],
        },
      ],
      config: {
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
            hp: { type: Type.STRING, description: "e.g. 120 HP" },
            abilities: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of ability names"
            },
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
          required: ["name", "set", "rarity", "type", "number", "hp", "abilities", "attacks"],
        },
      },
    });

    const text = response.text;
    if (!text) return null;

    // Extract grounding URLs if available
    const result = JSON.parse(text) as IdentificationResult;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    return {
      ...result,
      sourceUrl: sourceUrl
    } as any; 
  } catch (error) {
    console.error("Error identifying card:", error);
    return null;
  }
};
