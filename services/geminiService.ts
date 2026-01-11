
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are an elite Pokémon TCG Analyst.
Your goal is to identify the Pokémon card in the image provided and retrieve its current market value.

DIAGNOSTIC PROCESS:
1. Analyze the entire image to identify the Pokémon name (top left), its set symbol, and card number.
2. Use Google Search grounding to find the current "TCGPlayer Market Price" for the English version of this specific card.
3. If the card name is not perfectly legible, use the artwork and card layout to cross-reference and determine the correct identity.

OUTPUT RULES:
- Return ONLY valid JSON.
- If identification is impossible, return {"name": "Unknown Asset", "marketValue": "---"}.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The official name of the Pokémon." },
      marketValue: { type: Type.STRING, description: "Current market price (e.g., $12.45)." },
      set: { type: Type.STRING, description: "The card set name." },
      number: { type: Type.STRING, description: "The card number (e.g., 036/191)." },
      rarity: { type: Type.STRING, description: "The rarity of the card." }
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
            { text: "Analyze this Pokémon card. Identify its name and find the current market price using search grounding." },
          ],
        },
      ],
      config: getScannerConfig() as any,
    });
    
    const result = JSON.parse(response.text);
    
    return {
      name: result.name || "Unknown",
      marketValue: result.marketValue || "$--.--",
      set: result.set || "Unknown Set",
      rarity: result.rarity || "Common",
      type: "Unknown",
      number: result.number || "???/???",
      hp: "0",
      abilities: [],
      attacks: [],
      imageUrl: ""
    } as IdentificationResult;
  } catch (error) {
    console.error("Critical Identification Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Look up the card '${query}'. Provide official TCG data and current market value.`,
      config: {
        systemInstruction: "Expert TCG assistant. Provide official card data and current market value.",
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
    return { ...result };
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
      contents: `List cards from the Pokémon TCG set "${setName}".`,
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
            required: ["name", "number"]
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
