
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

// Identifies a Pokemon card from an image using Gemini's multi-modal capabilities and Google Search grounding.
export const identifyPokemonCard = async (base64Image: string, isRetry: boolean = false): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    
    // Extract grounding URLs if available from the search tool
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    let result;
    try {
      // Guideline: Use .text property to access extracted text.
      const rawText = response.text || "{}";
      result = JSON.parse(rawText.trim());
    } catch (e) {
      console.warn("Gemini returned non-JSON text with search grounding. Attempting repair.");
      return null;
    }
    
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
      imageUrl: "",
      sourceUrl: sourceUrl
    } as IdentificationResult;
  } catch (error) {
    console.error("Neural Identification Error:", error);
    return null;
  }
};

// Performs a manual lookup of card data based on a text query, utilizing Google Search grounding for real-time prices.
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
      console.error("Failed to parse manual lookup result:", e);
      return null;
    }

    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Manual Lookup Error:", error);
    return null;
  }
};

// Fetches a list of cards from a specific TCG set using Gemini and Google Search.
export const fetchCardsFromSet = async (setName: string): Promise<Partial<IdentificationResult>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `List cards from the Pokémon TCG set "${setName}".`,
      config: {
        systemInstruction: "Return set list with names, numbers, and market prices as a JSON array.",
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

    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.warn("JSON Parse failed for set fetch results");
      return [];
    }
  } catch (error) {
    console.error("Fetch Set Cards Error:", error);
    return [];
  }
};
