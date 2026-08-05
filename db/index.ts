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
      description TEXT NOT NULL DEFAULT '',
      institution TEXT NOT NULL DEFAULT 'NCHM',
      event_date TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      invite_token TEXT,
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      device_token_hash TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      gender TEXT,
      age_group TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stamp_points (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stamp_records (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      stamp_point_id TEXT NOT NULL REFERENCES stamp_points(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS club_stamp_records (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
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
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS participants_event_device_unique ON participants(event_id, device_token_hash)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants(event_id)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS stamp_points_token_unique ON stamp_points(token)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_stamp_points_event_position ON stamp_points(event_id, position)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS stamp_records_participant_point_unique ON stamp_records(participant_id, stamp_point_id)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_stamp_records_event_participant ON stamp_records(event_id, participant_id)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS club_stamp_records_participant_club_unique ON club_stamp_records(participant_id, club_id)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_club_stamp_records_event_participant ON club_stamp_records(event_id, participant_id)",
    ),
  ]);

  const eventColumns = await env.DB.prepare("PRAGMA table_info(events)").all<{
    name: string;
  }>();
  const eventColumnNames = new Set(eventColumns.results.map((column) => column.name));
  const missingEventColumns = [
    ["description", "ALTER TABLE events ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    ["start_date", "ALTER TABLE events ADD COLUMN start_date TEXT"],
    ["end_date", "ALTER TABLE events ADD COLUMN end_date TEXT"],
    ["invite_token", "ALTER TABLE events ADD COLUMN invite_token TEXT"],
  ] as const;
  for (const [column, statement] of missingEventColumns) {
    if (!eventColumnNames.has(column)) await env.DB.prepare(statement).run();
  }

  const missingInviteTokens = await env.DB.prepare(
    "SELECT id FROM events WHERE invite_token IS NULL OR invite_token = ''",
  ).all<{ id: string }>();
  for (const event of missingInviteTokens.results) {
    await env.DB.prepare("UPDATE events SET invite_token = ? WHERE id = ?")
      .bind(crypto.randomUUID().replaceAll("-", ""), event.id)
      .run();
  }
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS events_invite_token_unique ON events(invite_token)",
  ).run();

  const responseColumns = await env.DB.prepare("PRAGMA table_info(responses)").all<{
    name: string;
  }>();
  if (!responseColumns.results.some((column) => column.name === "participant_name")) {
    await env.DB.prepare(
      "ALTER TABLE responses ADD COLUMN participant_name TEXT NOT NULL DEFAULT ''",
    ).run();
  }
}
