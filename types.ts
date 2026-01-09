
export interface PokemonAttack {
  name: string;
  damage: string;
  description: string;
}

export interface PokemonCard {
  id: string;
  name: string;
  set: string;
  rarity: string;
  type: string;
  number: string;
  hp?: string;
  abilities?: string[];
  attacks?: PokemonAttack[];
  imageUrl?: string;
  scanDate: string;
  sourceUrl?: string;
}

export interface IdentificationResult {
  name: string;
  set: string;
  rarity: string;
  type: string;
  number: string;
  hp: string;
  abilities: string[];
  attacks: PokemonAttack[];
  sourceUrl?: string;
  imageUrl?: string;
}
