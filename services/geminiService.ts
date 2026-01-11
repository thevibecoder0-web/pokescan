
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are the Neural Core of the PokéScan TCG Identification Unit.
Your mission is to identify Pokémon cards from visual data, even in EXTREME conditions (low light, motion blur, heavy glare, or partial occlusion).

ADAPTIVE NEURAL CAPABILITIES:
1. LOW-LIGHT RECOVERY: If the image is dark, look for unique color distributions, set symbols (bottom corner), and distinctive artwork patterns.
2. PATTERN MATCHING: Recognize cards by their unique layout (e.g., Illustration Rares, VMAX, Tera Type borders) if text is illegible.
3. SEARCH GROUNDING: Use Google Search to verify "TCGPlayer Market Price" and official card details for the identified asset.
4. FULL DATA EXTRACTION: Identify Name, Set, Number, HP, and Type.

OUTPUT FORMAT:
- Return ONLY valid JSON.
- If the card is completely indistinguishable, return {"name": "IDENTIFICATION_FAILURE", "marketValue": "---"}.`;

const MODEL_NAME = 'gemini-3-pro-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Official card name." },
      marketValue: { type: Type.STRING, description: "Current market value (e.g. $5.20)." },
      set: { type: Type.STRING, description: "Card set name." },
      number: { type: Type.STRING, description: "Set number (e.g. 123/191)." },
      rarity: { type: Type.STRING, description: "Card rarity tier." },
      hp: { type: Type.STRING, description: "Health points." },
      type: { type: Type.STRING, description: "Pokemon type." }
    },
    required: ["name", "marketValue", "set", "number"],
  },
});

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "CRITICAL_IDENTIFY: Neural analysis required. This image may have poor lighting or quality. Use all visual cues (artwork, layout, symbols) to determine the exact card identity and market value." },
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
      console.warn("Gemini returned non-JSON. Parsing fallback.");
      return null;
    }
    
    if (!result.name || result.name === "IDENTIFICATION_FAILURE") return null;

    return {
      name: result.name,
      marketValue: result.marketValue || "$--.--",
      set: result.set || "Unknown",
      rarity: result.rarity || "Common",
      type: result.type || "Unknown",
      number: result.number || "???",
      hp: result.hp || "0",
      abilities: [],
      attacks: [],
      imageUrl: "",
      sourceUrl: sourceUrl
    } as IdentificationResult;
  } catch (error) {
    console.error("Neural Identification Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Look up '${query}'. Provide TCG data and market value.`,
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
    console.error("Manual Lookup Error:", error);
    return null;
  }
};

export const fetchCardsFromSet = async (setName: string): Promise<IdentificationResult[] | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `List all cards in the Pokémon TCG set: ${setName}. Include their official name, card number, rarity, and type.`,
      config: {
        systemInstruction: "You are a professional Pokémon TCG archivist. Provide accurate set listings in valid JSON format.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              number: { type: Type.STRING },
              rarity: { type: Type.STRING },
              type: { type: Type.STRING },
              hp: { type: Type.STRING }
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
      console.warn("Could not parse set list from Gemini.");
      return null;
    }
  } catch (error) {
    console.error("Fetch Set Archives Error:", error);
    return null;
  }
};
