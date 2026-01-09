
export interface PokemonCard {
  id: string;
  name: string;
  set: string;
  rarity: string;
  type: string;
  number: string;
  imageUrl?: string;
  scanDate: string;
}

export interface IdentificationResult {
  name: string;
  set: string;
  rarity: string;
  type: string;
  number: string;
}
