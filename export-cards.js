// Run with: node export-cards.js
// Exports all cards from your Supabase database to cards-backup.csv

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

async function exportCards() {
  console.log('Fetching cards from database...');

  const { data: cards, error } = await supabase
    .from('cards')
    .select('*')
    .order('card_id', { ascending: true });

  if (error) {
    console.error('Error fetching cards:', error.message);
    process.exit(1);
  }

  if (!cards || cards.length === 0) {
    console.log('No cards found in the database.');
    process.exit(0);
  }

  const headers = ['card_id', 'name', 'group', 'cardcode', 'era', 'rarity', 'droppable', 'image_url', 'designer_id'];

  const rows = cards.map(card =>
    headers.map(h => {
      const val = card[h] ?? '';
      // Wrap in quotes if value contains comma, newline, or quote
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  writeFileSync('cards-backup.csv', csv, 'utf8');

  console.log(`✅ Exported ${cards.length} cards to cards-backup.csv`);
}

exportCards();
