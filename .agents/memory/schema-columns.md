---
name: Schema column mapping
description: Which users-table columns map to which commands — avoids using nonexistent columns
---

The users table (schema.sql) has these timestamp columns:
- last_daily, last_weekly, last_drop, last_claim, last_surf, last_booster, last_bonanza

**Key mapping:**
- `/dream` → uses `last_surf` (no `last_explore` column exists; using it silently bypasses cooldown)

**Why:** The schema was written before dream was added. last_explore was never added to the DB, so any cooldown check on user.last_explore evaluates to undefined → falsy → cooldown skipped every time.

**How to apply:** Before using a new users column in a command, verify it exists in schema.sql. If not, either use an existing column or add the column to schema.sql with an ALTER TABLE migration note.
