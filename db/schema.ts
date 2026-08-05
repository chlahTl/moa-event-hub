import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull().default("NCHM"),
  eventDate: text("event_date").notNull(),
  location: text("location").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const clubs = sqliteTable("clubs", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
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
