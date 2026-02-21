import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface User {
  user_id: string;
  coins: number;
  last_daily: string | null;
  last_weekly: string | null;
  last_surf: string | null;
  last_drop: string | null;
  last_booster: string | null;
  last_bonanza: string | null;
  created_at: string;
}

export interface Card {
  card_id: number;
  name: string;
  group: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  image_url: string | null;
  created_at: string;
}

export interface Inventory {
  id: number;
  user_id: string;
  card_id: number;
  quantity: number;
  acquired_at: string;
}

export interface MarketplaceListing {
  listing_id: number;
  seller_id: string;
  card_id: number;
  price: number;
  quantity: number;
  created_at: string;
}
