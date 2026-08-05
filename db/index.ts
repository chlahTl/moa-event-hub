import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureDatabase() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT 'NCHM',
      event_date TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      collect_gender INTEGER NOT NULL DEFAULT 1,
      collect_age INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      participant_name TEXT NOT NULL DEFAULT '',
      gender TEXT,
      age_group TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_clubs_event_id ON clubs(event_id)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_responses_event_club ON responses(event_id, club_id)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_responses_created_at ON responses(created_at)",
    ),
  ]);

  const responseColumns = await env.DB.prepare("PRAGMA table_info(responses)").all<{
    name: string;
  }>();
  if (!responseColumns.results.some((column) => column.name === "participant_name")) {
    await env.DB.prepare(
      "ALTER TABLE responses ADD COLUMN participant_name TEXT NOT NULL DEFAULT ''",
    ).run();
  }
}
