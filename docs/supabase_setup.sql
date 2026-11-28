-- ============================================================================
-- White-Label App: Active Users, 30-Day Expiry, Audit Log & Unique ID Security
-- Run this once (or re-run safely to upgrade) in Supabase Dashboard -> SQL Editor
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 0. Server-Side Tenant Security Settings (prevents client-side bypass of requireUniqueId)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  require_unique_id BOOLEAN NOT NULL DEFAULT FALSE,
  inactivity_expiry_days INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. Active Users Table (current logged-in devices; max 1 active device per user/uniqueId)
--    name, mobile, state are nullable so Educational/Org tenants (require_unique_id = TRUE)
--    only capture unique_id + email and store name/mobile/state as NULL.
CREATE TABLE IF NOT EXISTS public.active_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  mobile TEXT,
  state TEXT,
  unique_id TEXT,
  device_id TEXT NOT NULL,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, user_id)
);

-- Safe idempotent migration for existing databases where name/mobile/state were NOT NULL
ALTER TABLE public.active_users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.active_users ALTER COLUMN mobile DROP NOT NULL;
ALTER TABLE public.active_users ALTER COLUMN state DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_users_tenant_unique_id
  ON public.active_users (tenant_id, LOWER(unique_id))
  WHERE unique_id IS NOT NULL AND unique_id <> '';

CREATE INDEX IF NOT EXISTS idx_active_users_last_opened
  ON public.active_users (last_opened_at);

-- 2. Append-Only Audit Table (preserves all LOGIN, RE_LOGIN, SESSION_REPLACED, EXPIRED_30D events)
CREATE TABLE IF NOT EXISTS public.login_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id UUID,
  name TEXT,
  email TEXT,
  mobile TEXT,
  state TEXT,
  unique_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('LOGIN', 'RE_LOGIN', 'SESSION_REPLACED', 'EXPIRED_30D')),
  last_opened_at TIMESTAMPTZ,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_audit_tenant_event_at
  ON public.login_audit (tenant_id, event_at DESC);

-- 3. Private Unique ID + Email Allowlist (for College / Organization tenants)
CREATE TABLE IF NOT EXISTS public.allowed_unique_ids (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unique_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe idempotent migration if allowed_unique_ids existed before email pairing
ALTER TABLE public.allowed_unique_ids ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_allowed_unique_ids_lookup
  ON public.allowed_unique_ids (tenant_id, LOWER(unique_id));

CREATE INDEX IF NOT EXISTS idx_allowed_unique_ids_pair
  ON public.allowed_unique_ids (tenant_id, LOWER(unique_id), LOWER(email));

-- ============================================================================
-- Row Level Security (RLS) - Prevent tampering, bulk reads, or client deletes
-- ============================================================================
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_unique_ids ENABLE ROW LEVEL SECURITY;

-- Users can only read their own active_users row; NO direct insert/update/delete from client
DROP POLICY IF EXISTS "active_users_select_own" ON public.active_users;
CREATE POLICY "active_users_select_own"
  ON public.active_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- tenant_settings, login_audit, allowed_unique_ids: zero direct client access
-- (enforced server-side inside SECURITY DEFINER RPCs)

-- ============================================================================
-- RPC 1: Check if an active session already exists on another device
-- (Used for open Temple/normal tenants where requireUniqueId = false)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_existing_session(
  p_tenant_id TEXT,
  p_email TEXT,
  p_unique_id TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_clean_uid TEXT := NULLIF(LOWER(TRIM(COALESCE(p_unique_id, ''))), '');
  v_existing_device TEXT;
  v_server_require_uid BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- If tenant enforces Unique ID server-side, do not leak session existence before validation
  SELECT COALESCE(ts.require_unique_id, FALSE) INTO v_server_require_uid
  FROM public.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id;

  IF v_server_require_uid THEN
    RETURN jsonb_build_object('exists', FALSE, 'same_device', FALSE);
  END IF;

  SELECT device_id INTO v_existing_device
  FROM public.active_users
  WHERE tenant_id = p_tenant_id
    AND (
      LOWER(email) = v_clean_email
      OR (v_clean_uid IS NOT NULL AND LOWER(unique_id) = v_clean_uid)
    )
  LIMIT 1;

  IF v_existing_device IS NOT NULL AND v_existing_device <> COALESCE(p_device_id, '') THEN
    RETURN jsonb_build_object('exists', TRUE, 'same_device', FALSE);
  ELSIF v_existing_device IS NOT NULL THEN
    RETURN jsonb_build_object('exists', TRUE, 'same_device', TRUE);
  END IF;

  RETURN jsonb_build_object('exists', FALSE, 'same_device', FALSE);
END;
$$;

-- ============================================================================
-- RPC 2: Complete login
-- - Enforces server-side tenant_settings.require_unique_id (cannot be bypassed by client)
-- - When require_unique_id is TRUE:
--     * Requires BOTH unique_id AND email to match the same active row in allowed_unique_ids
--     * Stores name, mobile, state as NULL
--     * Blocks invalid unique_id/email BEFORE checking existing sessions
-- - When require_unique_id is FALSE:
--     * Requires name, email, mobile, state (Temple / standard open mode)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_login(
  p_tenant_id TEXT,
  p_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT '',
  p_mobile TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_unique_id TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT '',
  p_replace_existing BOOLEAN DEFAULT FALSE,
  p_require_unique_id_db BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean_name TEXT := NULLIF(LEFT(TRIM(COALESCE(p_name, '')), 120), '');
  v_clean_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_clean_mobile TEXT := NULLIF(LEFT(TRIM(COALESCE(p_mobile, '')), 20), '');
  v_clean_state TEXT := NULLIF(LEFT(TRIM(COALESCE(p_state, '')), 80), '');
  v_clean_unique_id TEXT := NULLIF(TRIM(COALESCE(p_unique_id, '')), '');
  v_server_require_uid BOOLEAN := FALSE;
  v_effective_require_uid BOOLEAN := FALSE;
  v_old_row RECORD;
  v_had_prior_audit BOOLEAN := FALSE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  -- Server-side enforcement: if tenant_settings has require_unique_id = TRUE, client cannot bypass it
  SELECT COALESCE(ts.require_unique_id, FALSE) INTO v_server_require_uid
  FROM public.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id;

  v_effective_require_uid := COALESCE(v_server_require_uid, FALSE) OR COALESCE(p_require_unique_id_db, FALSE);

  IF v_effective_require_uid THEN
    IF v_clean_unique_id IS NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'UNIQUE_ID_REQUIRED');
    END IF;

    -- Match BOTH unique_id AND email on the same active allowlist record
    SELECT EXISTS (
      SELECT 1 FROM public.allowed_unique_ids
      WHERE tenant_id = p_tenant_id
        AND LOWER(TRIM(unique_id)) = LOWER(v_clean_unique_id)
        AND LOWER(TRIM(email)) = v_clean_email
        AND is_active = TRUE
    ) INTO v_allowed;

    IF NOT v_allowed THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_UNIQUE_ID');
    END IF;

    -- Org already holds student/member directory separately: store profile extras as NULL
    v_clean_name := NULL;
    v_clean_mobile := NULL;
    v_clean_state := NULL;
  ELSE
    -- Standard open-tenant mode (e.g. Temple): require name, mobile, state
    IF v_clean_name IS NULL OR v_clean_mobile IS NULL OR v_clean_state IS NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_INPUT');
    END IF;
    v_clean_unique_id := NULL;
  END IF;

  -- Check if an active row exists for this email or unique_id
  SELECT * INTO v_old_row
  FROM public.active_users
  WHERE tenant_id = p_tenant_id
    AND (
      LOWER(email) = v_clean_email
      OR (v_clean_unique_id IS NOT NULL AND LOWER(unique_id) = LOWER(v_clean_unique_id))
    )
  LIMIT 1;

  IF FOUND THEN
    IF v_old_row.device_id <> p_device_id AND NOT p_replace_existing THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'SESSION_EXISTS_OTHER_DEVICE');
    END IF;

    -- Remove old active row(s) matching email, unique_id, or current auth uid
    DELETE FROM public.active_users
    WHERE tenant_id = p_tenant_id
      AND (
        LOWER(email) = v_clean_email
        OR user_id = v_uid
        OR (v_clean_unique_id IS NOT NULL AND LOWER(unique_id) = LOWER(v_clean_unique_id))
      );

    IF v_old_row.device_id <> p_device_id THEN
      INSERT INTO public.login_audit (
        tenant_id, user_id, name, email, mobile, state, unique_id, device_id,
        event_type, last_opened_at, details
      ) VALUES (
        p_tenant_id, v_old_row.user_id, v_old_row.name, v_old_row.email, v_old_row.mobile,
        v_old_row.state, v_old_row.unique_id, v_old_row.device_id,
        'SESSION_REPLACED', v_old_row.last_opened_at,
        'Terminated by new login on device ' || p_device_id
      );
    END IF;
  ELSE
    -- Clean up any stale row for this auth uid
    DELETE FROM public.active_users WHERE tenant_id = p_tenant_id AND user_id = v_uid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.login_audit
    WHERE tenant_id = p_tenant_id AND LOWER(email) = v_clean_email
  ) INTO v_had_prior_audit;

  INSERT INTO public.active_users (
    tenant_id, user_id, name, email, mobile, state, unique_id, device_id, logged_in_at, last_opened_at
  ) VALUES (
    p_tenant_id, v_uid, v_clean_name, v_clean_email, v_clean_mobile, v_clean_state,
    v_clean_unique_id, p_device_id, NOW(), NOW()
  );

  INSERT INTO public.login_audit (
    tenant_id, user_id, name, email, mobile, state, unique_id, device_id,
    event_type, last_opened_at, details
  ) VALUES (
    p_tenant_id, v_uid, v_clean_name, v_clean_email, v_clean_mobile, v_clean_state,
    v_clean_unique_id, p_device_id,
    CASE WHEN v_had_prior_audit THEN 'RE_LOGIN' ELSE 'LOGIN' END,
    NOW(),
    'Device ' || p_device_id
  );

  RETURN jsonb_build_object('success', TRUE, 'logged_in_at', NOW());
END;
$$;

-- ============================================================================
-- RPC 3: Daily App-Open Ping & Session Validity Check
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ping_active_user(
  p_tenant_id TEXT,
  p_device_id TEXT,
  p_expiry_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row RECORD;
  v_effective_days INTEGER := GREATEST(1, COALESCE(p_expiry_days, 30));
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'REVOKED');
  END IF;

  SELECT GREATEST(1, COALESCE(ts.inactivity_expiry_days, v_effective_days)) INTO v_effective_days
  FROM public.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id;

  v_effective_days := GREATEST(1, COALESCE(v_effective_days, p_expiry_days, 30));

  SELECT * INTO v_row
  FROM public.active_users
  WHERE tenant_id = p_tenant_id AND user_id = v_uid
  LIMIT 1;

  IF NOT FOUND OR v_row.device_id <> p_device_id THEN
    RETURN jsonb_build_object('status', 'REVOKED');
  END IF;

  IF v_row.last_opened_at < NOW() - make_interval(days => v_effective_days) THEN
    DELETE FROM public.active_users WHERE id = v_row.id;
    INSERT INTO public.login_audit (
      tenant_id, user_id, name, email, mobile, state, unique_id, device_id,
      event_type, last_opened_at, details
    ) VALUES (
      v_row.tenant_id, v_row.user_id, v_row.name, v_row.email, v_row.mobile,
      v_row.state, v_row.unique_id, v_row.device_id,
      'EXPIRED_30D', v_row.last_opened_at, 'Expired on app open'
    );
    RETURN jsonb_build_object('status', 'EXPIRED');
  END IF;

  UPDATE public.active_users
  SET last_opened_at = NOW()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('status', 'ACTIVE', 'last_opened_at', NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.check_existing_session(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_existing_session(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_login(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_login(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.ping_active_user(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ping_active_user(TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- Nightly Job: Move users inactive > 30 days from active_users to login_audit
-- STRICTLY RESTRICTED: Not callable by anon or authenticated clients!
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_inactive_users(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH expired AS (
    DELETE FROM public.active_users
    WHERE last_opened_at < NOW() - make_interval(days => GREATEST(1, p_days))
    RETURNING *
  ),
  audited AS (
    INSERT INTO public.login_audit (
      tenant_id, user_id, name, email, mobile, state, unique_id, device_id,
      event_type, last_opened_at, details
    )
    SELECT
      tenant_id, user_id, name, email, mobile, state, unique_id, device_id,
      'EXPIRED_30D', last_opened_at, 'Auto-removed by nightly 30-day inactivity job'
    FROM expired
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM audited;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_inactive_users(INTEGER) FROM PUBLIC, anon, authenticated;

-- Schedule nightly at 00:15 UTC (unschedule first if re-running script)
SELECT cron.unschedule('expire_inactive_users_nightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_inactive_users_nightly');

SELECT cron.schedule(
  'expire_inactive_users_nightly',
  '15 0 * * *',
  $$SELECT public.expire_inactive_users(30);$$
);

-- ============================================================================
-- EXAMPLE TENANT SETUP (Uncomment & customize per tenant)
-- ============================================================================
-- Temple tenant (open login, no Unique ID required):
-- INSERT INTO public.tenant_settings (tenant_id, require_unique_id, inactivity_expiry_days)
-- VALUES ('pushtiprakash', FALSE, 30)
-- ON CONFLICT (tenant_id) DO UPDATE SET require_unique_id = EXCLUDED.require_unique_id;
--
-- College tenant (strict Unique ID + Email pairing enforced server-side):
-- INSERT INTO public.tenant_settings (tenant_id, require_unique_id, inactivity_expiry_days)
-- VALUES ('my_college', TRUE, 30)
-- ON CONFLICT (tenant_id) DO UPDATE SET require_unique_id = EXCLUDED.require_unique_id;
--
-- INSERT INTO public.allowed_unique_ids (tenant_id, unique_id, email, label, is_active)
-- VALUES ('my_college', 'STU-2026-001', 'student1@college.edu', 'BSc Year 1', TRUE)
-- ON CONFLICT DO NOTHING;
