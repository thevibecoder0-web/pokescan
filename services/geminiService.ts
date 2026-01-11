
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are an elite TCG OCR and identification engine. 
Your primary function is to analyze Pokemon card images and extract high-precision data.

PRECISION PROTOCOLS:
1. TEXT EXTRACTION: Focus intensely on the card name (top) and the set number/total (bottom corner, e.g., 030/132).
2. VISUAL MATCHING: Use artwork, colors, and layout to confirm identity even if text is partially obscured.
3. MARKET SYNC: Retrieve the current TCGPlayer market value using the search tool.
4. FALLBACK: If the card is completely unidentifiable, return the name as "(unfound)".

OUTPUT: Valid JSON only matching the requested schema. No conversational text.`;

// Using the Pro model for high-quality image understanding as requested.
const PRIMARY_MODEL = 'gemini-3-pro-preview';

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
      model: PRIMARY_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "SCAN_ASSET: Perform full identification. Extract Name, Set, Number, and current Market Value. Provide a complete JSON object." },
        ],
      },
      config: getScannerConfig() as any,
    });
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sourceUrl = groundingChunks?.[0]?.web?.uri;

    let result;
    try {
      const text = response.text?.trim() || "{}";
      // Handle potential markdown code blocks in output
      const jsonStr = text.startsWith('```json') ? text.replace(/^```json/, '').replace(/```$/, '') : text;
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON Parse Error in AI response", e);
      return null;
    }
    
    if (!result.name || result.name === "(unfound)") return null;

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
      imageUrl: "", // To be filled by original scan
      sourceUrl: sourceUrl
    } as IdentificationResult;
  } catch (error) {
    console.error("Gemini Scan Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
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
      model: PRIMARY_MODEL,
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
