-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  coins INTEGER DEFAULT 0,
  last_daily TIMESTAMP,
  last_weekly TIMESTAMP,
  last_surf TIMESTAMP,
  last_drop TIMESTAMP,
  last_claim TIMESTAMP,
  last_booster TIMESTAMP,
  last_bonanza TIMESTAMP,
  bio TEXT DEFAULT '',
  favorite_card_id INTEGER,
  profile_color TEXT DEFAULT '#ff69b4',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
  card_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "group" TEXT NOT NULL,
  cardcode TEXT NOT NULL,
  era TEXT,
  rarity INTEGER CHECK (rarity IN (1, 2, 3, 4, 5)) NOT NULL,
  droppable BOOLEAN DEFAULT true,
  image_url TEXT,
  designer_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  card_id INTEGER REFERENCES cards(card_id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  acquired_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- Marketplace listings table
CREATE TABLE IF NOT EXISTS marketplace (
  listing_id SERIAL PRIMARY KEY,
  seller_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  card_id INTEGER REFERENCES cards(card_id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User blocked artists table
CREATE TABLE IF NOT EXISTS user_blocked_artists (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, artist_name)
);

-- Quiz questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  answer TEXT NOT NULL,
  reward_coins INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_card ON marketplace(card_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace(seller_id);
CREATE INDEX IF NOT EXISTS idx_user_blocked_artists ON user_blocked_artists(user_id);
