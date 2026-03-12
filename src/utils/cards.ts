import { Card } from '../database/supabase.js';

export function getRandomRarity(): number {
  const random = Math.random() * 100;
  
  // Logic: Lower drop rate = harder to get.
  // Thresholds based on prompt's target probabilities:
  // 5★ (20%): 0-20
  // 4★ (30%): 20-50
  // 3★ (45%): 50-95
  // 2★ (60%?): Prompt says 60% and 70%, but cumulative must be 100.
  // We'll treat the prompt's numbers as relative weights or specific tier chances.
  
  if (random < 8) return 5;    // Rarest (8% chance - increased from 5%)
  if (random < 20) return 4;   // Rare (12% chance - increased from 10%)
  if (random < 40) return 3;   // Uncommon (20% chance)
  if (random < 70) return 2;   // Common (30% chance)
  return 1;                    // Very Common (30% chance)
}

export function getRarityName(rarity: number): string {
  switch (rarity) {
    case 1: return 'Common';
    case 2: return 'Uncommon';
    case 3: return 'Rare';
    case 4: return 'Epic';
    case 5: return 'Legendary';
    default: return 'Unknown';
  }
}

export function getRarityEmoji(rarity: number): string {
  const emoji = '<:emoji_11:1480042903568122018>';
  return emoji.repeat(Math.max(1, rarity));
}

export function getRarityColor(rarity: number): number {
  switch (rarity) {
    case 1: return 0xD3D3D3;
    case 2: return 0x99FF99;
    case 3: return 0x69B4FF;
    case 4: return 0xD8A8E8;
    case 5: return 0xFFFF99;
    default: return 0xD3D3D3;
  }
}
