import { env } from "cloudflare:workers";
import { ensureDatabase } from "../db";
import { getSeoulDateKey } from "./event-lifecycle";
import { SUPER_ADMIN_EMAIL } from "../app/auth";

export const INTERNAL_ANALYTICS_RANGES = [7, 30, 90] as const;
export type InternalAnalyticsRange = typeof INTERNAL_ANALYTICS_RANGES[number];

export type InternalOverviewData = {
  rangeDays: InternalAnalyticsRange;
  fromDate: string;
  toDate: string;
  summary: {
    totalUsers: number;
    newUsers: number;
    loginCount: number;
    activeUsers: number;
    totalEvents: number;
  };
  daily: Array<{
    date: string;
    newUsers: number;
    loginCount: number;
    activeUsers: number;
    requestCount: number;
  }>;
  users: Array<{
    id: string;
    displayName: string;
    email: string;
    providers: string[];
    createdAt: string;
    eventCount: number;
    loginCount: number;
    requestCount: number;
    lastLoginAt: string | null;
    lastActiveAt: string | null;
  }>;
};

type CountRow = { total: number | string };
type DailyCountRow = { date: string; total: number | string; requests?: number | string };
type UserRow = {
  id: string;
  display_name: string;
  email: string;
  providers: string | null;
  created_at: string;
  event_count: number | string;
  login_count: number | string;
  request_count: number | string;
  last_login_at: string | null;
  last_active_at: string | null;
};

export function normalizeInternalAnalyticsRange(value: string | null): InternalAnalyticsRange {
  const parsed = Number(value);
  return INTERNAL_ANALYTICS_RANGES.includes(parsed as InternalAnalyticsRange)
    ? parsed as InternalAnalyticsRange
    : 30;
}

export async function getInternalOverview(
  rangeDays: InternalAnalyticsRange,
  rawQuery = "",
): Promise<InternalOverviewData> {
  await ensureDatabase();
  const query = rawQuery.normalize("NFKC").trim().toLowerCase().slice(0, 100);
  const toDate = getSeoulDateKey();
  const fromDate = addCalendarDays(toDate, -(rangeDays - 1));
  const userFilter = "lower(email) <> ?";

  const [
    totalUsersResult,
    newUsersResult,
    loginCountResult,
    activeUsersResult,
    totalEventsResult,
    dailyUsersResult,
    dailyLoginsResult,
    dailyActivityResult,
  ] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${userFilter}`)
      .bind(SUPER_ADMIN_EMAIL).all<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM users
      WHERE ${userFilter} AND date(created_at, '+9 hours') BETWEEN ? AND ?`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM login_events le
      INNER JOIN users u ON u.id = le.user_id
      WHERE lower(u.email) <> ? AND date(le.logged_in_at, '+9 hours') BETWEEN ? AND ?`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<CountRow>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT uda.user_id) AS total FROM user_daily_activity uda
      INNER JOIN users u ON u.id = uda.user_id
      WHERE lower(u.email) <> ? AND uda.activity_date BETWEEN ? AND ?`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM events e
      INNER JOIN users u ON u.id = e.owner_user_id
      WHERE lower(u.email) <> ? AND e.deleted_at IS NULL`)
      .bind(SUPER_ADMIN_EMAIL).all<CountRow>(),
    env.DB.prepare(`SELECT date(created_at, '+9 hours') AS date, COUNT(*) AS total FROM users
      WHERE ${userFilter} AND date(created_at, '+9 hours') BETWEEN ? AND ?
      GROUP BY date(created_at, '+9 hours')`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<DailyCountRow>(),
    env.DB.prepare(`SELECT date(le.logged_in_at, '+9 hours') AS date, COUNT(*) AS total FROM login_events le
      INNER JOIN users u ON u.id = le.user_id
      WHERE lower(u.email) <> ? AND date(le.logged_in_at, '+9 hours') BETWEEN ? AND ?
      GROUP BY date(le.logged_in_at, '+9 hours')`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<DailyCountRow>(),
    env.DB.prepare(`SELECT uda.activity_date AS date, COUNT(*) AS total,
      COALESCE(SUM(uda.request_count), 0) AS requests
      FROM user_daily_activity uda INNER JOIN users u ON u.id = uda.user_id
      WHERE lower(u.email) <> ? AND uda.activity_date BETWEEN ? AND ?
      GROUP BY uda.activity_date`)
      .bind(SUPER_ADMIN_EMAIL, fromDate, toDate).all<DailyCountRow>(),
  ]);

  const searchClause = query ? "AND (lower(u.email) LIKE ? OR lower(u.display_name) LIKE ?)" : "";
  const userStatement = env.DB.prepare(`SELECT
      u.id,
      u.display_name,
      u.email,
      GROUP_CONCAT(DISTINCT oa.provider) AS providers,
      u.created_at,
      (SELECT COUNT(*) FROM events e WHERE e.owner_user_id = u.id AND e.deleted_at IS NULL) AS event_count,
      (SELECT COUNT(*) FROM login_events le WHERE le.user_id = u.id
        AND date(le.logged_in_at, '+9 hours') BETWEEN ? AND ?) AS login_count,
      (SELECT COALESCE(SUM(uda.request_count), 0) FROM user_daily_activity uda WHERE uda.user_id = u.id
        AND uda.activity_date BETWEEN ? AND ?) AS request_count,
      (SELECT MAX(le.logged_in_at) FROM login_events le WHERE le.user_id = u.id) AS last_login_at,
      (SELECT MAX(uda.last_seen_at) FROM user_daily_activity uda WHERE uda.user_id = u.id) AS last_active_at
    FROM users u
    LEFT JOIN oauth_accounts oa ON oa.user_id = u.id
    WHERE lower(u.email) <> ? ${searchClause}
    GROUP BY u.id
    ORDER BY COALESCE(last_active_at, last_login_at, u.created_at) DESC
    LIMIT 100`);
  const searchPattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const userResult = query
    ? await userStatement.bind(fromDate, toDate, fromDate, toDate, SUPER_ADMIN_EMAIL, searchPattern, searchPattern).all<UserRow>()
    : await userStatement.bind(fromDate, toDate, fromDate, toDate, SUPER_ADMIN_EMAIL).all<UserRow>();

  const newUsersByDate = countMap(dailyUsersResult.results);
  const loginsByDate = countMap(dailyLoginsResult.results);
  const activityByDate = new Map(dailyActivityResult.results.map((row) => [row.date, {
    activeUsers: numberValue(row.total),
    requestCount: numberValue(row.requests),
  }]));

  return {
    rangeDays,
    fromDate,
    toDate,
    summary: {
      totalUsers: firstCount(totalUsersResult.results),
      newUsers: firstCount(newUsersResult.results),
      loginCount: firstCount(loginCountResult.results),
      activeUsers: firstCount(activeUsersResult.results),
      totalEvents: firstCount(totalEventsResult.results),
    },
    daily: dateRange(fromDate, toDate).map((date) => ({
      date,
      newUsers: newUsersByDate.get(date) ?? 0,
      loginCount: loginsByDate.get(date) ?? 0,
      activeUsers: activityByDate.get(date)?.activeUsers ?? 0,
      requestCount: activityByDate.get(date)?.requestCount ?? 0,
    })),
    users: userResult.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      providers: row.providers?.split(",").filter(Boolean) ?? [],
      createdAt: row.created_at,
      eventCount: numberValue(row.event_count),
      loginCount: numberValue(row.login_count),
      requestCount: numberValue(row.request_count),
      lastLoginAt: row.last_login_at,
      lastActiveAt: row.last_active_at,
    })),
  };
}

function countMap(rows: DailyCountRow[]) {
  return new Map(rows.map((row) => [row.date, numberValue(row.total)]));
}

function firstCount(rows: CountRow[]) {
  return numberValue(rows[0]?.total);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRange(fromDate: string, toDate: string) {
  const dates: string[] = [];
  for (let date = fromDate; date <= toDate; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
}
