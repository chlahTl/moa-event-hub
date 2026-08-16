import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the `DB` binding in wrangler.jsonc before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureDatabase() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      institution TEXT NOT NULL DEFAULT 'NCHM',
      event_date TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      stamp_enabled INTEGER NOT NULL DEFAULT 0,
      invite_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      logged_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_daily_activity (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT,
      event_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      stamp_emoji TEXT NOT NULL DEFAULT '⭐',
      stamp_message TEXT NOT NULL DEFAULT '',
      submission_guide TEXT NOT NULL DEFAULT '',
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
      contact_info TEXT NOT NULL DEFAULT '',
      affiliation TEXT NOT NULL DEFAULT '',
      visited_at TEXT,
      record_source TEXT NOT NULL DEFAULT 'qr',
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
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_event_created ON admin_audit_logs(event_id, created_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created ON admin_audit_logs(actor_email, created_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS oauth_accounts_provider_subject_unique ON oauth_accounts(provider, provider_account_id)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_unique ON auth_sessions(token_hash)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires ON auth_sessions(user_id, expires_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_login_events_user_logged_in ON login_events(user_id, logged_in_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_login_events_logged_in ON login_events(logged_in_at)",
    ),
    env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS user_daily_activity_user_date_unique ON user_daily_activity(user_id, activity_date)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_daily_activity_date ON user_daily_activity(activity_date)",
    ),
  ]);

  const eventColumns = await env.DB.prepare("PRAGMA table_info(events)").all<{
    name: string;
  }>();
  const eventColumnNames = new Set(eventColumns.results.map((column) => column.name));
  const addingStampEnabled = !eventColumnNames.has("stamp_enabled");
  const missingEventColumns = [
    ["owner_user_id", "ALTER TABLE events ADD COLUMN owner_user_id TEXT"],
    ["description", "ALTER TABLE events ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    ["start_date", "ALTER TABLE events ADD COLUMN start_date TEXT"],
    ["end_date", "ALTER TABLE events ADD COLUMN end_date TEXT"],
    ["invite_token", "ALTER TABLE events ADD COLUMN invite_token TEXT"],
    ["updated_at", "ALTER TABLE events ADD COLUMN updated_at TEXT"],
    ["deleted_at", "ALTER TABLE events ADD COLUMN deleted_at TEXT"],
    ["deleted_by", "ALTER TABLE events ADD COLUMN deleted_by TEXT"],
    ["stamp_enabled", "ALTER TABLE events ADD COLUMN stamp_enabled INTEGER NOT NULL DEFAULT 0"],
  ] as const;
  for (const [column, statement] of missingEventColumns) {
    if (!eventColumnNames.has(column)) await env.DB.prepare(statement).run();
  }
  if (addingStampEnabled) {
    await env.DB.prepare(`UPDATE events SET stamp_enabled = 1
      WHERE EXISTS (SELECT 1 FROM clubs WHERE clubs.event_id = events.id)
         OR EXISTS (SELECT 1 FROM stamp_points WHERE stamp_points.event_id = events.id)`).run();
  }
  await env.DB.prepare(
    "UPDATE events SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL",
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_events_deleted_event_date ON events(deleted_at, event_date)",
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_events_owner_deleted_date ON events(owner_user_id, deleted_at, event_date)",
  ).run();

  const clubColumns = await env.DB.prepare("PRAGMA table_info(clubs)").all<{
    name: string;
  }>();
  const clubColumnNames = new Set(clubColumns.results.map((column) => column.name));
  const missingClubColumns = [
    ["stamp_emoji", "ALTER TABLE clubs ADD COLUMN stamp_emoji TEXT NOT NULL DEFAULT '⭐'"],
    ["stamp_message", "ALTER TABLE clubs ADD COLUMN stamp_message TEXT NOT NULL DEFAULT ''"],
    ["submission_guide", "ALTER TABLE clubs ADD COLUMN submission_guide TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [column, statement] of missingClubColumns) {
    if (!clubColumnNames.has(column)) await env.DB.prepare(statement).run();
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

  const participantColumns = await env.DB.prepare("PRAGMA table_info(participants)").all<{
    name: string;
  }>();
  const participantColumnNames = new Set(participantColumns.results.map((column) => column.name));
  const missingParticipantColumns = [
    ["contact_info", "ALTER TABLE participants ADD COLUMN contact_info TEXT NOT NULL DEFAULT ''"],
    ["affiliation", "ALTER TABLE participants ADD COLUMN affiliation TEXT NOT NULL DEFAULT ''"],
    ["visited_at", "ALTER TABLE participants ADD COLUMN visited_at TEXT"],
    ["record_source", "ALTER TABLE participants ADD COLUMN record_source TEXT NOT NULL DEFAULT 'qr'"],
  ] as const;
  for (const [column, statement] of missingParticipantColumns) {
    if (!participantColumnNames.has(column)) await env.DB.prepare(statement).run();
  }

  await env.DB.prepare("PRAGMA optimize").run();
}
