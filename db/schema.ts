import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  institution: text("institution").notNull().default("NCHM"),
  eventDate: text("event_date").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  location: text("location").notNull().default(""),
  status: text("status").notNull().default("active"),
  stampEnabled: integer("stamp_enabled", { mode: "boolean" }).notNull().default(false),
  inviteToken: text("invite_token"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at"),
  deletedAt: text("deleted_at"),
  deletedBy: text("deleted_by"),
}, (table) => [
  uniqueIndex("events_invite_token_unique").on(table.inviteToken),
  index("idx_events_owner_deleted_date").on(table.ownerUserId, table.deletedAt, table.eventDate),
  index("idx_events_deleted_event_date").on(table.deletedAt, table.eventDate),
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_users_email").on(table.email),
]);

export const oauthAccounts = sqliteTable("oauth_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("oauth_accounts_provider_subject_unique").on(table.provider, table.providerAccountId),
  index("idx_oauth_accounts_user_id").on(table.userId),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
  index("idx_auth_sessions_user_expires").on(table.userId, table.expiresAt),
]);

export const loginEvents = sqliteTable("login_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  loggedInAt: text("logged_in_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_login_events_user_logged_in").on(table.userId, table.loggedInAt),
  index("idx_login_events_logged_in").on(table.loggedInAt),
]);

export const userDailyActivity = sqliteTable("user_daily_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  activityDate: text("activity_date").notNull(),
  requestCount: integer("request_count").notNull().default(1),
  firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("user_daily_activity_user_date_unique").on(table.userId, table.activityDate),
  index("idx_user_daily_activity_date").on(table.activityDate),
]);

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey(),
  // Deliberately not a foreign key: permanent event deletion must not erase its audit trail.
  eventId: text("event_id"),
  eventName: text("event_name").notNull().default(""),
  action: text("action").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  details: text("details").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_admin_audit_logs_event_created").on(table.eventId, table.createdAt),
  index("idx_admin_audit_logs_actor_created").on(table.actorEmail, table.createdAt),
]);

export const clubs = sqliteTable("clubs", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  stampEmoji: text("stamp_emoji").notNull().default("⭐"),
  stampMessage: text("stamp_message").notNull().default(""),
  submissionGuide: text("submission_guide").notNull().default(""),
  collectGender: integer("collect_gender", { mode: "boolean" })
    .notNull()
    .default(true),
  collectAge: integer("collect_age", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  clubId: text("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  participantName: text("participant_name").notNull().default(""),
  gender: text("gender"),
  ageGroup: text("age_group"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  deviceTokenHash: text("device_token_hash").notNull(),
  participantName: text("participant_name").notNull(),
  gender: text("gender"),
  ageGroup: text("age_group"),
  contactInfo: text("contact_info").notNull().default(""),
  affiliation: text("affiliation").notNull().default(""),
  visitedAt: text("visited_at"),
  recordSource: text("record_source").notNull().default("qr"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("participants_event_device_unique").on(table.eventId, table.deviceTokenHash),
  index("idx_participants_event_id").on(table.eventId),
]);

export const stampPoints = sqliteTable("stamp_points", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stamp_points_token_unique").on(table.token),
  index("idx_stamp_points_event_position").on(table.eventId, table.position),
]);

export const stampRecords = sqliteTable("stamp_records", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  participantId: text("participant_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  stampPointId: text("stamp_point_id")
    .notNull()
    .references(() => stampPoints.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("stamp_records_participant_point_unique").on(table.participantId, table.stampPointId),
  index("idx_stamp_records_event_participant").on(table.eventId, table.participantId),
]);

export const clubStampRecords = sqliteTable("club_stamp_records", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  participantId: text("participant_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  clubId: text("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("club_stamp_records_participant_club_unique").on(table.participantId, table.clubId),
  index("idx_club_stamp_records_event_participant").on(table.eventId, table.participantId),
]);
