import { supabase } from '../database/supabase.js';

let blockedCache: { type: string; name: string }[] = [];
let lastCacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute

export async function getBlockedGroups() {
  const now = Date.now();
  if (lastCacheTime && now - lastCacheTime < CACHE_DURATION) {
    return blockedCache;
  }

  try {
    const { data } = await supabase.from('blocked_groups').select('*');
    if (data) {
      blockedCache = data.map(b => ({ type: b.type, name: (b.name || '').toLowerCase() }));
      lastCacheTime = now;
    }
  } catch (e) {
    console.error('Error fetching blocked groups:', e);
  }

  return blockedCache;
}

export async function filterBlockedCards(cards: any[]) {
  const blocked = await getBlockedGroups();
  return cards.filter(card => {
    const cardGroup = (card.group || '').toLowerCase();
    const cardName = (card.name || '').toLowerCase();
    
    return !blocked.some(b => {
      if (b.type === 'group') return cardGroup === b.name;
      if (b.type === 'artist') return cardName === b.name;
      return false;
    });
  });
}
