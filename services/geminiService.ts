
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are the core of a PokéScan High-Speed Asset Identification Unit.
Your objective is to identify Pokémon cards from visual data and retrieve their current market value.

RELIABILITY PROTOCOLS:
1. OVERALL VISUAL MATCHING: If the text is blurry, use the card's artwork, layout, colors, and set symbols to identify it. You have access to a vast internal database of all Pokémon cards.
2. PRICE FETCHING: Use Google Search to find the latest "TCGPlayer Market Price" for the English version. 
3. FALLBACK: Never return "Unknown" if there is a recognizable Pokémon on the card. Use your best estimation based on the visible features.

OUTPUT FORMAT:
- Return ONLY valid JSON.
- name: Official English card name.
- marketValue: Current price (e.g., "$15.00").
- set: Official set name.
- number: Collection number (e.g., "001/191").
- rarity: Official rarity.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getScannerConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
  tools: [{ googleSearch: {} }],
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Official name of the card." },
      marketValue: { type: Type.STRING, description: "Market value string." },
      set: { type: Type.STRING, description: "The expansion set name." },
      number: { type: Type.STRING, description: "The card number in set." },
      rarity: { type: Type.STRING, description: "Card rarity." }
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
            { text: "IDENTIFY_ASSET: Scan this image for a Pokémon card. Extract identity and market price via search." },
          ],
        },
      ],
      config: getScannerConfig() as any,
    });
    
    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    // Safety check to avoid "Unknown Asset" appearing to the user
    if (!result.name || result.name.toLowerCase().includes("unknown") || result.name.toLowerCase().includes("asset")) {
        return null;
    }

    return {
      name: result.name,
      marketValue: result.marketValue || "$--.--",
      set: result.set || "Unknown Set",
      rarity: result.rarity || "Common",
      type: "Unknown",
      number: result.number || "???",
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
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Fetch Set Cards Error:", error);
    return [];
  }
};
