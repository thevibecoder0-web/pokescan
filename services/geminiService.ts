
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a high-precision Pokémon TCG asset identifier.
Your task is to identify the Pokémon card in the image and provide its official name and current market value.

STRICT RULES:
1. The Pokémon's name is always in the TOP-LEFT corner.
2. Use Google Search to find the current TCGPlayer market price for the English version of this card.
3. Return the results strictly in JSON format.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The Pokémon's name from the top-left." },
      marketValue: { type: Type.STRING, description: "The current market price in USD, e.g., '$12.50'." }
    },
    required: ["name", "marketValue"],
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
            { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            { text: "Identify the name in the top-left of this card and its current market price." },
          ],
        },
      ],
      config: getScannerConfig() as any,
    });
    
    const result = JSON.parse(response.text);
    
    return {
      name: result.name || "Unknown",
      marketValue: result.marketValue || "$??.??",
      set: "SV8",
      rarity: "Common",
      type: "Unknown",
      number: "000/000",
      hp: "0",
      abilities: [],
      attacks: [],
      imageUrl: ""
    } as IdentificationResult;
  } catch (error) {
    console.error("Scanning Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Look up the card '${query}' in the Surging Sparks (SV8) English set. Get its official number and current TCGPlayer market value.`,
      config: {
        systemInstruction: "Expert TCG assistant. Provide official SV8 data and market value.",
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
            marketValue: { type: Type.STRING },
            imageUrl: { type: Type.STRING },
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
          required: ["name", "set", "number"],
        }
      } as any,
    });
    const result = JSON.parse(response.text) as IdentificationResult;
    const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(c => c.web?.uri)?.web?.uri;
    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Manual Lookup Error:", error);
    return null;
  }
};

export const fetchCardsFromSet = async (setName: string): Promise<Partial<IdentificationResult>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `List cards from the Pokémon TCG set "${setName}" (English).`,
      config: {
        systemInstruction: "Return a list of cards from the requested set in English with market prices.",
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              number: { type: Type.STRING },
              imageUrl: { type: Type.STRING },
              set: { type: Type.STRING },
              marketValue: { type: Type.STRING },
              rarity: { type: Type.STRING },
              type: { type: Type.STRING }
            },
            required: ["name", "number", "imageUrl"]
          }
        }
      } as any,
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Fetch Set Cards Error:", error);
    return [];
  }
};
