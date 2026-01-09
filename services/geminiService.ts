
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are an expert Pokémon TCG assistant specializing in the Surging Sparks (SV8) English set. 
Your primary goal is to provide 100% accurate official English card data and real-time market value.

VERIFIED SET SEQUENCE FOR SURGING SPARKS (SV8):
#1: Exeggcute
#2: Alolan Exeggutor ex
#3: Hoothoot
#4: Noctowl
#5: Shroomish
#6: Breloom
#7: Budew
#8: Roselia
#9: Roserade
#10: Cottonee
#11: Whimsicott
#12: Petilil
#13: Lilligant
#14: Maractus
#15: Deerling
#32: Charcadet
#33: Ceruledge
#36: Pikachu ex

STRICT RULES:
1. Do NOT use data from Brilliant Stars.
2. ALWAYS provide an estimated "marketValue" in USD (e.g., "$12.50"). Use Google Search to find current TCGPlayer market price or eBay sold averages.
3. Return data strictly in the requested JSON format.`;

const MODEL_NAME = 'gemini-3-flash-preview';

const getSafeConfig = () => ({
  systemInstruction: SYSTEM_INSTRUCTION,
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
      marketValue: { type: Type.STRING, description: "Estimated market value in USD like '$5.00'" },
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
    required: ["name", "set", "number", "marketValue"],
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
            { text: "Identify this Pokémon TCG card from the 'Surging Sparks (SV8)' English set. Specifically find the card name, its number, and its current market price on TCGPlayer. Search query: 'surging sparks card #{number} tcgplayer price'" },
          ],
        },
      ],
      config: getSafeConfig() as any,
    });
    const result = JSON.parse(response.text) as IdentificationResult;
    const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find(c => c.web?.uri)?.web?.uri;
    return { ...result, sourceUrl };
  } catch (error) {
    console.error("Card Identification Error:", error);
    return null;
  }
};

export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Look up the card '${query}' in the Surging Sparks (SV8) English set. Get its official number and current TCGPlayer market value.`,
      config: getSafeConfig() as any,
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
      contents: `List cards from the Pokémon TCG set "${setName}" (English), including estimated market values for each if available.`,
      config: {
        systemInstruction: "You are a TCG database. Return a list of cards from the requested set in English with market prices.",
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
