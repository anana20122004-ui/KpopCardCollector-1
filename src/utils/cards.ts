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
  
  if (random < 3) return 5;    // Legendary (3% chance)
  if (random < 15) return 4;   // Epic (12% chance)
  if (random < 35) return 3;   // Rare (20% chance)
  if (random < 65) return 2;   // Uncommon (30% chance)
  return 1;                    // Common (35% chance)
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
  const filled = '<:emoji_62:1505577836134662325>';
  const empty  = '<:emoji_11:1480042903568122018>';
  const count  = Math.max(1, Math.min(rarity, 5));
  return filled.repeat(count) + empty.repeat(5 - count);
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
