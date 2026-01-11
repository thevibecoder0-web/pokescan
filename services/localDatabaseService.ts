
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';
import { IdentificationResult } from '../types';

/**
 * Intelligent local matching engine.
 * Prioritizes card number (e.g. "036/191") as it's the unique identifier.
 * Falls back to name fuzzy matching if number is not detected.
 */
export const matchToLocalDatabase = (name: string, number: string): IdentificationResult | null => {
  if (!name && !number) return null;

  const normalizedName = name.toLowerCase().trim();
  const normalizedNumber = number.replace(/\s/g, ''); // Remove spaces from "036 / 191"

  // 1. Try exact number match (High Confidence)
  if (normalizedNumber) {
    const numberMatch = SURGING_SPARKS_DATA.find(card => card.number === normalizedNumber);
    if (numberMatch) return numberMatch;
  }

  // 2. Try Name Match (Medium Confidence)
  if (normalizedName) {
    const nameMatch = SURGING_SPARKS_DATA.find(card => 
      card.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(card.name.toLowerCase())
    );
    if (nameMatch) return nameMatch;
  }

  return null;
};
