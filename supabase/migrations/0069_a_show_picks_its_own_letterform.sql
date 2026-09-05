-- ─────────────────────────────────────────────────────────────────────────
-- 0069_a_show_picks_its_own_letterform.sql
--
-- CJ, 5 Sep 2026: the show title moves INTO the uploaded artwork, the name
-- stripe runs full-bleed, and each show chooses the font its buttons are
-- lettered in. The renderer changes live in code; the database's part is one
-- column: the CSS font-family stack the name and role are drawn with.
-- Null means the renderer's default (system-ui) — every existing template
-- keeps looking exactly as it did.
--
-- Applied to live novapa via MCP as hub_0069_a_show_picks_its_own_letterform
-- on 5 Sep 2026.
-- ─────────────────────────────────────────────────────────────────────────
set search_path = family_hub, extensions;

alter table button_templates add column if not exists font_family text;
