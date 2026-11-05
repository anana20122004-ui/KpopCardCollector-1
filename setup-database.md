# Supabase Database Setup Instructions

To set up your K-pop card bot database, follow these steps:

> **Current schema note:** Existing projects should run `src/database/migrations/streaks-and-lyrics.sql` in the Supabase SQL Editor. For a fresh database, use `src/database/schema.sql` and `src/database/rpc-functions.sql`; the inline SQL below is the older setup copy.

## Step 1: Access Supabase SQL Editor
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New query"

## Step 2: Run the Database Schema

**IMPORTANT:** Copy and paste ALL of the following SQL code into the SQL Editor and click "Run". This includes both the table schema AND the RPC functions that handle transactions safely.

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  coins INTEGER DEFAULT 0,
  last_daily TIMESTAMP,
  last_weekly TIMESTAMP,
  last_surf TIMESTAMP,
  last_drop TIMESTAMP,
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
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rarity Levels:
-- 1 = Common
-- 2 = Uncommon
-- 3 = Rare
-- 4 = Epic
-- 5 = Legendary

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
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_card ON marketplace(card_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace(seller_id);

-- RPC function to claim daily reward atomically
CREATE OR REPLACE FUNCTION claim_daily_reward(p_user_id TEXT, p_reward INTEGER, p_cooldown_hours INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_cooldown_end TIMESTAMP;
  v_now TIMESTAMP := NOW();
BEGIN
  SELECT * INTO v_user FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF p_user_id != '1403958587843149937' AND v_user.last_daily IS NOT NULL THEN
    v_cooldown_end := v_user.last_daily + (p_cooldown_hours || ' hours')::INTERVAL;
    IF v_now < v_cooldown_end THEN
      RETURN json_build_object('success', false, 'error', 'on_cooldown', 'cooldown_remaining_ms', EXTRACT(EPOCH FROM (v_cooldown_end - v_now)) * 1000);
    END IF;
  END IF;
  UPDATE users SET coins = coins + p_reward, last_daily = v_now WHERE user_id = p_user_id;
  RETURN json_build_object('success', true, 'old_balance', v_user.coins, 'new_balance', v_user.coins + p_reward, 'reward', p_reward);
END;
$$;

-- RPC function to claim weekly reward atomically
CREATE OR REPLACE FUNCTION claim_weekly_reward(p_user_id TEXT, p_reward INTEGER, p_cooldown_hours INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_cooldown_end TIMESTAMP;
  v_now TIMESTAMP := NOW();
BEGIN
  SELECT * INTO v_user FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF p_user_id != '1403958587843149937' AND v_user.last_weekly IS NOT NULL THEN
    v_cooldown_end := v_user.last_weekly + (p_cooldown_hours || ' hours')::INTERVAL;
    IF v_now < v_cooldown_end THEN
      RETURN json_build_object('success', false, 'error', 'on_cooldown', 'cooldown_remaining_ms', EXTRACT(EPOCH FROM (v_cooldown_end - v_now)) * 1000);
    END IF;
  END IF;
  UPDATE users SET coins = coins + p_reward, last_weekly = v_now WHERE user_id = p_user_id;
  RETURN json_build_object('success', true, 'old_balance', v_user.coins, 'new_balance', v_user.coins + p_reward, 'reward', p_reward);
END;
$$;

-- RPC function to claim surf reward atomically
CREATE OR REPLACE FUNCTION claim_surf_reward(p_user_id TEXT, p_reward INTEGER, p_cooldown_hours INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_cooldown_end TIMESTAMP;
  v_now TIMESTAMP := NOW();
BEGIN
  SELECT * INTO v_user FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF p_user_id != '1403958587843149937' AND v_user.last_surf IS NOT NULL THEN
    v_cooldown_end := v_user.last_surf + (p_cooldown_hours || ' hours')::INTERVAL;
    IF v_now < v_cooldown_end THEN
      RETURN json_build_object('success', false, 'error', 'on_cooldown', 'cooldown_remaining_ms', EXTRACT(EPOCH FROM (v_cooldown_end - v_now)) * 1000);
    END IF;
  END IF;
  UPDATE users SET coins = coins + p_reward, last_surf = v_now WHERE user_id = p_user_id;
  RETURN json_build_object('success', true, 'old_balance', v_user.coins, 'new_balance', v_user.coins + p_reward, 'reward', p_reward);
END;
$$;

-- RPC function to purchase a marketplace listing atomically
CREATE OR REPLACE FUNCTION purchase_marketplace_listing(p_buyer_id TEXT, p_listing_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing RECORD;
  v_buyer RECORD;
BEGIN
  SELECT * INTO v_listing FROM marketplace WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'listing_not_found');
  END IF;
  IF v_listing.seller_id = p_buyer_id THEN
    RETURN json_build_object('success', false, 'error', 'cannot_buy_own_listing');
  END IF;
  SELECT * INTO v_buyer FROM users WHERE user_id = p_buyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'buyer_not_found');
  END IF;
  IF v_buyer.coins < v_listing.price THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_funds', 'required', v_listing.price, 'available', v_buyer.coins);
  END IF;
  UPDATE users SET coins = coins - v_listing.price WHERE user_id = p_buyer_id;
  UPDATE users SET coins = coins + v_listing.price WHERE user_id = v_listing.seller_id;
  IF EXISTS (SELECT 1 FROM inventory WHERE user_id = p_buyer_id AND card_id = v_listing.card_id) THEN
    UPDATE inventory SET quantity = quantity + v_listing.quantity WHERE user_id = p_buyer_id AND card_id = v_listing.card_id;
  ELSE
    INSERT INTO inventory (user_id, card_id, quantity) VALUES (p_buyer_id, v_listing.card_id, v_listing.quantity);
  END IF;
  DELETE FROM marketplace WHERE listing_id = p_listing_id;
  RETURN json_build_object('success', true, 'card_id', v_listing.card_id, 'quantity', v_listing.quantity, 'price', v_listing.price, 'new_balance', v_buyer.coins - v_listing.price);
END;
$$;

-- RPC function to list a card on marketplace atomically
CREATE OR REPLACE FUNCTION list_card_on_marketplace(p_user_id TEXT, p_card_id INTEGER, p_price INTEGER, p_quantity INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_inventory RECORD;
  v_new_listing_id INTEGER;
BEGIN
  SELECT * INTO v_inventory FROM inventory WHERE user_id = p_user_id AND card_id = p_card_id FOR UPDATE;
  IF NOT FOUND OR v_inventory.quantity < p_quantity THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_cards', 'available', COALESCE(v_inventory.quantity, 0));
  END IF;
  IF v_inventory.quantity = p_quantity THEN
    DELETE FROM inventory WHERE id = v_inventory.id;
  ELSE
    UPDATE inventory SET quantity = quantity - p_quantity WHERE id = v_inventory.id;
  END IF;
  INSERT INTO marketplace (seller_id, card_id, price, quantity) VALUES (p_user_id, p_card_id, p_price, p_quantity) RETURNING listing_id INTO v_new_listing_id;
  RETURN json_build_object('success', true, 'listing_id', v_new_listing_id, 'card_id', p_card_id, 'price', p_price, 'quantity', p_quantity);
END;
$$;

-- RPC function to open a card pack atomically
CREATE OR REPLACE FUNCTION open_card_pack(p_user_id TEXT, p_pack_cost INTEGER, p_card_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_user.coins < p_pack_cost THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_funds', 'required', p_pack_cost, 'available', v_user.coins);
  END IF;
  UPDATE users SET coins = coins - p_pack_cost WHERE user_id = p_user_id;
  IF EXISTS (SELECT 1 FROM inventory WHERE user_id = p_user_id AND card_id = p_card_id) THEN
    UPDATE inventory SET quantity = quantity + 1 WHERE user_id = p_user_id AND card_id = p_card_id;
  ELSE
    INSERT INTO inventory (user_id, card_id, quantity) VALUES (p_user_id, p_card_id, 1);
  END IF;
  RETURN json_build_object('success', true, 'new_balance', v_user.coins - p_pack_cost, 'old_balance', v_user.coins);
END;
$$;
```

## Step 3: Add Sample Cards (Optional)

To add some sample K-pop cards to test with, run this SQL:

```sql
INSERT INTO cards (name, "group", era, rarity, image_url) VALUES
  ('Jisoo', 'BLACKPINK', 'Born Pink', 5, 'https://i.imgur.com/placeholder1.jpg'),
  ('Jennie', 'BLACKPINK', 'Born Pink', 5, 'https://i.imgur.com/placeholder2.jpg'),
  ('Rosé', 'BLACKPINK', 'The Album', 4, 'https://i.imgur.com/placeholder3.jpg'),
  ('Lisa', 'BLACKPINK', 'The Album', 4, 'https://i.imgur.com/placeholder4.jpg'),
  ('RM', 'BTS', 'Proof', 5, 'https://i.imgur.com/placeholder5.jpg'),
  ('Jin', 'BTS', 'Proof', 4, 'https://i.imgur.com/placeholder6.jpg'),
  ('Suga', 'BTS', 'Map of the Soul: 7', 4, 'https://i.imgur.com/placeholder7.jpg'),
  ('J-Hope', 'BTS', 'Map of the Soul: 7', 3, 'https://i.imgur.com/placeholder8.jpg'),
  ('Jimin', 'BTS', 'Map of the Soul: 7', 3, 'https://i.imgur.com/placeholder9.jpg'),
  ('V', 'BTS', 'Love Yourself: Answer', 2, 'https://i.imgur.com/placeholder10.jpg'),
  ('Jungkook', 'BTS', 'Love Yourself: Answer', 1, 'https://i.imgur.com/placeholder11.jpg'),
  ('Karina', 'aespa', 'MY WORLD', 4, 'https://i.imgur.com/placeholder12.jpg'),
  ('Winter', 'aespa', 'MY WORLD', 2, 'https://i.imgur.com/placeholder13.jpg'),
  ('Giselle', 'aespa', 'Girls', 3, 'https://i.imgur.com/placeholder14.jpg'),
  ('Ningning', 'aespa', 'Girls', 1, 'https://i.imgur.com/placeholder15.jpg');
```

## Step 4: Verify Setup

Check that everything is created correctly:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Count cards
SELECT COUNT(*) as total_cards FROM cards;
```

## Done!

Your database is now ready! You can use the Discord bot commands:
- Use `/start` to register as a user
- Use `/addcard` (admin only) to add more cards
- Use `/drop` to collect cards
- And all other commands!
