
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are the Neural Core of the PokéScan TCG Identification Unit.
Your mission is to identify Pokémon cards from visual data and retrieve live market values.

ADAPTIVE CAPABILITIES:
1. FUZZY RECOGNITION: If text is distorted or obscured, use the card's artwork, holo patterns, set symbols (bottom left/right), and layout to determine identity.
2. SEARCH GROUNDING: Always use Google Search to verify the "TCGPlayer Market Price" for the English edition.
3. ERROR RECOVERY: If a previous attempt failed, the user will notify you. In 'Recovery Mode', relax your certainty threshold and provide the most probable match based on visual evidence.

OUTPUT FORMAT:
- Return ONLY valid JSON.
- If completely unrecognizable, return {"name": "DEEP_SCAN_REQUIRED", "marketValue": "---"}.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getScannerConfig = (isRetry: boolean) => ({
  systemInstruction: SYSTEM_INSTRUCTION + (isRetry ? "\n[RECOVERY MODE ACTIVE: Prioritize artwork and set symbols over text.]" : ""),
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Official card name." },
      marketValue: { type: Type.STRING, description: "Current market value (e.g. $5.20)." },
      set: { type: Type.STRING, description: "Card set name." },
      number: { type: Type.STRING, description: "Set number (e.g. 123/191)." },
      rarity: { type: Type.STRING, description: "Card rarity tier." }
    },
    required: ["name", "marketValue"],
  },
});

export const identifyPokemonCard = async (base64Image: string, isRetry: boolean = false): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // --- FIX: Use single Content object with parts for generateContent ---
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: isRetry 
              ? "RECOVERY_SCAN: Previous attempt failed. Identify this asset using all visual cues (art, symbols)." 
              : "IDENTIFY_ASSET: Extract name and search live market price." 
          },
        ],
      },
      config: getScannerConfig(isRetry) as any,
    });
    
    // --- FIX: Access text property directly (it is a getter, not a method) ---
    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    // Check if the AI returned a valid identity or the failure flag
    if (!result.name || result.name === "DEEP_SCAN_REQUIRED") {
        return null;
    }

    return {
      name: result.name,
      marketValue: result.marketValue || "$--.--",
      set: result.set || "Unknown",
      rarity: result.rarity || "Common",
      type: "Unknown",
      number: result.number || "???",
      hp: "0",
      abilities: [],
      attacks: [],
      imageUrl: ""
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
        systemInstruction: "Expert TCG assistant. Provide card data and market value.",
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
    // --- FIX: Access text property directly ---
    const result = JSON.parse(response.text || "{}") as IdentificationResult;
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
        systemInstruction: "Return set list with names, numbers, and market prices.",
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
    // --- FIX: Access text property directly ---
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Fetch Set Cards Error:", error);
    return [];
  }
};
