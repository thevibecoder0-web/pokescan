
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';
import { IdentificationResult } from '../types';

/**
 * Advanced Matching Algorithm.
 * Assigns weights to different detection features to find the most likely asset.
 */
export const matchToLocalDatabase = (name: string, number: string): IdentificationResult | null => {
  if (!name && !number) return null;

  const normalizedName = name.toLowerCase().trim();
  const normalizedNumber = number.replace(/\s/g, ''); 

  let bestMatch: IdentificationResult | null = null;
  let highestScore = 0;

  for (const card of SURGING_SPARKS_DATA) {
    let score = 0;
    const cardName = card.name.toLowerCase();
    const cardNumber = card.number.replace(/\s/g, '');

    // 1. Precise Number Match (Weight: 10)
    if (normalizedNumber && cardNumber === normalizedNumber) {
      score += 10;
    } 
    // 2. Partial Number Match (Weight: 5)
    else if (normalizedNumber && normalizedNumber.includes('/') && cardNumber.split('/')[0] === normalizedNumber.split('/')[0]) {
      score += 5;
    }

    // 3. Name Match (Weight: 8 for exact, 4 for partial)
    if (normalizedName) {
      if (cardName === normalizedName) {
        score += 8;
      } else if (cardName.includes(normalizedName) || normalizedName.includes(cardName)) {
        score += 4;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = card;
    }
  }

  // Minimum threshold to prevent false positives
  return highestScore >= 4 ? bestMatch : null;
};
