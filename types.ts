
export interface PokemonCard {
  id: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  imageUrl: string; // Online high-res URL
  marketPrice: number;
  currency: string;
  timestamp: number;
  type?: string;
  hp?: string;
  marketValue?: string;
  sourceUrl?: string;
  scanDate?: string;
}

export interface IdentificationResult {
  name: string;
  set: string;
  number: string;
  rarity: string;
  marketPrice: number;
  imageUrl: string; // Standardized property name
  found: boolean;
  type?: string;
  hp?: string;
  abilities?: string[];
  attacks?: string[];
  currency?: string;
  marketValue?: string;
  sourceUrl?: string;
}
