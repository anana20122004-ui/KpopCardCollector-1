// Run with: node export-cards.js
// Exports cards, users, and inventory from your Supabase database to CSV files

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

function toCSV(rows, headers) {
  const escape = val => {
    const str = String(val ?? '');
    return (str.includes(',') || str.includes('"') || str.includes('\n'))
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))];
  return lines.join('\n');
}

async function exportTable(tableName, headers, filename, orderCol) {
  console.log(`Fetching ${tableName}...`);
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order(orderCol, { ascending: true });

  if (error) {
    console.error(`❌ Error fetching ${tableName}:`, error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`⚠️  No data found in ${tableName}.`);
    return;
  }

  writeFileSync(filename, toCSV(data, headers), 'utf8');
  console.log(`✅ Exported ${data.length} rows to ${filename}`);
}

async function exportInventoryWithNames() {
  console.log('Fetching inventory with card & user details...');
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id,
      user_id,
      quantity,
      acquired_at,
      cards ( card_id, name, group, cardcode, rarity, era )
    `)
    .order('id', { ascending: true });

  if (error) {
    console.error('❌ Error fetching inventory:', error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log('⚠️  No inventory found.');
    return;
  }

  const headers = ['id', 'user_id', 'card_id', 'card_name', 'group', 'cardcode', 'rarity', 'era', 'quantity', 'acquired_at'];
  const rows = data.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    card_id: row.cards?.card_id ?? '',
    card_name: row.cards?.name ?? '',
    group: row.cards?.group ?? '',
    cardcode: row.cards?.cardcode ?? '',
    rarity: row.cards?.rarity ?? '',
    era: row.cards?.era ?? '',
    quantity: row.quantity,
    acquired_at: row.acquired_at,
  }));

  writeFileSync('inventory-backup.csv', toCSV(rows, headers), 'utf8');
  console.log(`✅ Exported ${rows.length} rows to inventory-backup.csv`);
}

async function main() {
  await exportTable(
    'cards',
    ['card_id', 'name', 'group', 'cardcode', 'era', 'rarity', 'droppable', 'image_url', 'designer_id', 'created_at'],
    'cards-backup.csv',
    'card_id'
  );

  await exportTable(
    'users',
    ['user_id', 'coins', 'bio', 'profile_color', 'favorite_card_id', 'last_daily', 'last_weekly', 'last_surf', 'last_drop', 'last_claim', 'last_booster', 'last_bonanza', 'created_at'],
    'users-backup.csv',
    'created_at'
  );

  await exportInventoryWithNames();

  console.log('\nDone! Download the CSV files from the file panel on the left.');
}

main();
