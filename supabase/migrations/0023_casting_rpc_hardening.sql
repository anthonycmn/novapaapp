-- 0023 — close the anon gap 0022 left. Found by probing the deployed RPC
-- with the bare anon key: it answered "No casting board" — meaning the
-- staff gate had been walked straight past. Two separate mistakes:
--
--   1. is_staffish() is NULL, not false, when there is no JWT (auth.uid()
--      is null, so the profiles lookup returns no row). `if not null then`
--      does not raise. Every guard is now `if not coalesce(is_staffish(),
--      false)`.
--   2. Supabase's default privileges grant EXECUTE to anon and
--      authenticated on every new function; 0022's `revoke ... from
--      public` never touched the direct anon grant. anon is now revoked
--      explicitly — and revoked AGAIN after the create-or-replace below,
--      because recreating a function re-applies the defaults.
--
-- The applied migration (family_hub_0023_casting_rpc_hardening on novapa)
-- re-creates both functions with the coalesced guard; the bodies are
-- otherwise identical to 0022. See that migration for the canonical text.
--
-- Verified after applying: both RPCs answer 42501 "permission denied" to
-- the anon key.

revoke execute on function family_hub.portal_submit_casting(uuid) from anon;
revoke execute on function family_hub.portal_publish_understudies(uuid) from anon;
