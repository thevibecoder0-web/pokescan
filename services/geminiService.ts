
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

const SYSTEM_INSTRUCTION = `You are a professional Pokemon TCG identification engine. 
Analyze the provided image of a Pokemon card.
Extract:
1. Name of the card.
2. Set name.
3. Card number (e.g., 030/132).
4. Rarity.
5. Estimated market price in USD (numeric).
6. HP.
7. Type (e.g., Fire, Water).

RULES:
- If the image is not a Pokemon card or is unreadable, set "found" to false.
- Accuracy is paramount. Use visual features and text.
- Response must be strictly JSON.`;

// Primary identification function for image analysis
export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Identify this Pokemon card. Be extremely accurate." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            set: { type: Type.STRING },
            number: { type: Type.STRING },
            rarity: { type: Type.STRING },
            marketPrice: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            found: { type: Type.BOOLEAN },
            hp: { type: Type.STRING },
            type: { type: Type.STRING },
            marketValue: { type: Type.STRING }
          },
          required: ["name", "found"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    if (!result.found) return null;
    return result as IdentificationResult;
  } catch (error) {
    console.error("Gemini ID Error:", error);
    return null;
  }
};

// Export alias for Scanner component
export const identifyCard = identifyPokemonCard;

// Manual lookup leveraging Google Search for live market data
export const manualCardLookup = async (query: string): Promise<IdentificationResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are a Pokemon card lookup engine. Find current TCG market prices and metadata from reliable sources. Respond in JSON.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            set: { type: Type.STRING },
            number: { type: Type.STRING },
            rarity: { type: Type.STRING },
            marketPrice: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            found: { type: Type.BOOLEAN },
            imageUrl: { type: Type.STRING },
            hp: { type: Type.STRING },
            type: { type: Type.STRING },
            marketValue: { type: Type.STRING }
          },
          required: ["name", "found"]
        }
      }
    });
    const result = JSON.parse(response.text || '{}');
    return result.found ? result : null;
  } catch (error) {
    console.error("Manual Lookup Error:", error);
    return null;
  }
};

// Fetch cards from a specific set using Search Grounding
export const fetchCardsFromSet = async (setName: string): Promise<IdentificationResult[] | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Retrieve a list of cards in the Pokemon TCG set: ${setName}. Include name, number, rarity, and image URL if possible.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              number: { type: Type.STRING },
              rarity: { type: Type.STRING },
              imageUrl: { type: Type.STRING },
              type: { type: Type.STRING },
              hp: { type: Type.STRING }
            },
            required: ["name", "number"]
          }
        }
      }
    });
    const result = JSON.parse(response.text || '[]');
    return result.map((c: any) => ({
      ...c,
      set: setName,
      found: true,
      marketPrice: 0,
      currency: "USD"
    }));
  } catch (error) {
    console.error("Fetch Set Error:", error);
    return null;
  }
};
