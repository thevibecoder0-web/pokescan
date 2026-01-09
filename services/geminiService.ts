
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult } from "../types";

export const identifyPokemonCard = async (base64Image: string): Promise<IdentificationResult | null> => {
  try {
    // Initialize inside the function to ensure process.env.API_KEY is available
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: "Identify this Pokemon trading card. Extract the card name, set name, rarity, type, and card number. Be as accurate as possible. If the image is not a Pokemon card, return placeholders with the word 'Unknown'.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            set: { type: Type.STRING },
            rarity: { type: Type.STRING },
            type: { type: Type.STRING },
            number: { type: Type.STRING },
          },
          required: ["name", "set", "rarity", "type", "number"],
        },
      },
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as IdentificationResult;
  } catch (error) {
    console.error("Error identifying card:", error);
    return null;
  }
};
