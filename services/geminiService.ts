
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are the Neural Core of the PokéScan TCG Identification Unit.
Your mission is to identify Pokémon cards from visual data INSTANTLY.

RESILIENCE PROTOCOLS:
1. NO FAILURES: Even in extreme conditions (blur, low light, glare), you must provide your absolute BEST GUESS.
2. VISUAL HEURISTICS: Analyze the card frame, artwork style, and set symbol position.
3. OUTPUT: Provide the card name and set number as primary targets. Retrieve current market value.

OUTPUT FORMAT: Valid JSON only.`;

const FLASH_MODEL = 'gemini-3-flash-preview';
const PRO_MODEL = 'gemini-3-pro-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      marketValue: { type: Type.STRING },
      set: { type: Type.STRING },
      number: { type: Type.STRING },
      rarity: { type: Type.STRING },
      hp: { type: Type.STRING },
      type: { type: Type.STRING }
    },
    required: ["name"],
  },
});

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "IDENTIFY_ASSET: Rapid neural scan. Provide identity, set number, and market price." },
        ],
      },
      config: getScannerConfig() as any,
    });
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    let result;
    try {
      result = JSON.parse(response.text?.trim() || "{}");
    } catch (e) {
      return null;
    }
    
    if (!result.name) return null;

    return {
      name: result.name,
      marketValue: result.marketValue || "$--.--",
      set: result.set || "Unknown Set",
      rarity: result.rarity || "Unknown",
      type: result.type || "Unknown",
      number: result.number || "???",
      hp: result.hp || "0",
      abilities: [],
      attacks: [],
      imageUrl: "",
      sourceUrl: sourceUrl
    } as IdentificationResult;
  } catch (error) {
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: `Look up '${query}'. Provide full TCG data and market value.`,
      config: {
        systemInstruction: "Expert TCG assistant. Return card data and market value in JSON format.",
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
            imageUrl: { type: Type.STRING }
          },
          required: ["name", "set", "number"],
        }
      } as any,
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    let result;
    try {
      result = JSON.parse(response.text || "{}");
    } catch (e) {
      return null;
    }

    return { ...result, sourceUrl };
  } catch (error) {
    return null;
  }
};

export const fetchCardsFromSet = async (setName: string): Promise<IdentificationResult[] | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `List all cards in the Pokémon TCG set: ${setName}.`,
      config: {
        systemInstruction: "Professional archivist. Provide set listings in valid JSON format.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              number: { type: Type.STRING },
              rarity: { type: Type.STRING }
            },
            required: ["name", "number"]
          }
        }
      }
    });

    try {
      const result = JSON.parse(response.text?.trim() || "[]");
      return result.map((card: any) => ({
        ...card,
        set: setName,
        abilities: [],
        attacks: [],
        imageUrl: "", 
        marketValue: "$--.--"
      }));
    } catch (e) {
      return null;
    }
  } catch (error) {
    return null;
  }
};
