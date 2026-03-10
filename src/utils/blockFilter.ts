import { supabase } from '../database/supabase.js';

const userBlockCache = new Map<string, { artists: Set<string>; time: number }>();
const CACHE_DURATION = 60000; // 1 minute

export async function getUserBlockedArtists(userId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = userBlockCache.get(userId);
  
  if (cached && now - cached.time < CACHE_DURATION) {
    return cached.artists;
  }

  try {
    const { data } = await supabase.from('user_blocked_artists').select('artist_name').eq('user_id', userId);
    const artists = new Set((data || []).map((item: any) => (item.artist_name || '').toLowerCase()));
    userBlockCache.set(userId, { artists, time: now });
    return artists;
  } catch (e) {
    console.error('Error fetching blocked artists:', e);
    return new Set();
  }
}

export async function filterBlockedCards(cards: any[], userId: string) {
  const blockedArtists = await getUserBlockedArtists(userId);
  return cards.filter(card => {
    const cardName = (card.name || '').toLowerCase();
    return !blockedArtists.has(cardName);
  });
}
