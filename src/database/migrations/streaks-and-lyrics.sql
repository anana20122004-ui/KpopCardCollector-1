-- Apply this migration to an existing Supabase project before using the new
-- daily-streak reward logic or /game lyrics.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ALTER COLUMN profile_color SET DEFAULT '#F6C5D0';

CREATE TABLE IF NOT EXISTS public.lyric_questions (
  id BIGSERIAL PRIMARY KEY,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language = 'en'),
  reward_coins INTEGER NOT NULL DEFAULT 50 CHECK (reward_coins >= 0),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lyric_answer_2_to_6_words CHECK (
    array_length(regexp_split_to_array(trim(answer), E'\\s+'), 1) BETWEEN 2 AND 6
  )
);

ALTER TABLE public.lyric_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lyric_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lyric_questions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lyric_questions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.claim_daily_reward(
  p_user_id TEXT,
  p_reward INTEGER,
  p_cooldown_hours INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_cooldown_end TIMESTAMP;
  v_now TIMESTAMP := NOW();
  v_next_streak INTEGER;
  v_bonus_percent INTEGER;
  v_final_reward INTEGER;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_user.last_daily IS NOT NULL THEN
    v_cooldown_end := v_user.last_daily + (p_cooldown_hours || ' hours')::INTERVAL;
    IF v_now < v_cooldown_end THEN
      RETURN json_build_object(
        'success', false,
        'error', 'on_cooldown',
        'cooldown_remaining_ms', EXTRACT(EPOCH FROM (v_cooldown_end - v_now)) * 1000
      );
    END IF;
  END IF;

  -- Staff keep their cooldown bypass but cannot farm additional streak levels.
  IF COALESCE(p_cooldown_hours, 24) = 0 THEN
    v_next_streak := GREATEST(COALESCE(v_user.daily_streak, 0), 1);
  ELSIF v_user.last_daily IS NULL
    OR v_now > v_user.last_daily + INTERVAL '48 hours'
    OR COALESCE(v_user.daily_streak, 0) < 1 THEN
    v_next_streak := 1;
  ELSE
    v_next_streak := v_user.daily_streak + 1;
  END IF;

  v_bonus_percent := LEAST((v_next_streak - 1) * 10, 100);
  v_final_reward := FLOOR(p_reward::NUMERIC * (100 + v_bonus_percent) / 100)::INTEGER;

  UPDATE public.users
  SET coins = coins + v_final_reward,
      last_daily = v_now,
      daily_streak = v_next_streak
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'old_balance', v_user.coins,
    'new_balance', v_user.coins + v_final_reward,
    'reward', v_final_reward,
    'streak', v_next_streak,
    'bonus_percent', v_bonus_percent
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_daily_reward(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.award_lyric_reward(p_user_id TEXT, p_reward INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  IF p_reward < 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_reward');
  END IF;

  UPDATE public.users
  SET coins = COALESCE(coins, 0) + p_reward
  WHERE user_id = p_user_id
  RETURNING coins INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'user_not_found');
  END IF;

  RETURN json_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.award_lyric_reward(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_lyric_reward(TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
