
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a high-precision OCR engine specialized in Pokémon TCG cards.
Your SOLE task is to extract the text located in the TOP-LEFT corner of the card provided in the image. 
This is typically the Pokémon's name.

STRICT RULES:
1. Only return the text found in the top-left.
2. Do not attempt to identify the set, rarity, or other attributes unless they are part of the name text in that specific corner.
3. If no text is found in the top-left, return "Unknown".
4. Return the result in JSON format.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The text extracted from the top-left corner of the card." }
    },
    required: ["name"],
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
            { text: "Extract the text from the top-left corner of this card image." },
          ],
        },
      ],
      config: getScannerConfig() as any,
    });
    
    const result = JSON.parse(response.text);
    
    // We return a partial result that satisfies the UI display requirement
    return {
      name: result.name || "Unknown",
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
    console.error("OCR Extraction Error:", error);
    return null;
  }
};

/**
 * Keeping manual lookup and set fetch for the "Lookup" and "Vault" tabs 
 * while the scanner is specialized for top-left text.
 */
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
