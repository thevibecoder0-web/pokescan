
export interface PokemonCard {
  id: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  imageUrl: string;
  marketPrice: number;
  currency: string;
  timestamp: number;
  hp?: string;
  type?: string;
  scanDate?: string;
  sourceUrl?: string;
  marketValue?: string;
}

export interface IdentificationResult {
  name: string;
  set: string;
  number: string;
  rarity: string;
  marketPrice: number;
  currency: string;
  found: boolean;
  imageUrl?: string;
  type?: string;
  hp?: string;
  marketValue?: string;
  abilities?: any[];
  attacks?: any[];
}
