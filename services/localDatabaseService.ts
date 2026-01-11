
import { SURGING_SPARKS_DATA } from '../data/surgingSparks';
import { IdentificationResult, PokemonCard } from '../types';

/**
 * Attempt to match OCR results to the local database of cards.
 * This works 100% offline and has no API limits.
 */
export const matchToLocalDatabase = (name: string, number: string): IdentificationResult | null => {
  if (!name && !number) return null;

  // Search in preloaded sets (currently Surging Sparks)
  const match = SURGING_SPARKS_DATA.find(card => {
    const nameMatch = name && card.name.toLowerCase().includes(name.toLowerCase());
    const numberMatch = number && card.number.includes(number);
    
    // If we have a number match, it's very likely the correct card
    if (numberMatch) return true;
    // If we only have name, it's a guess but helpful
    if (nameMatch && !number) return true;
    
    return false;
  });

  return match || null;
};
