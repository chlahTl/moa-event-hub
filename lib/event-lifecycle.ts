export const SEOUL_TIME_ZONE = "Asia/Seoul";

export type EventLifecycle = "ongoing" | "upcoming" | "past";

export type EventDateLike = {
  eventDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type EventLifecycleLike = EventDateLike & {
  id: string;
  status?: string | null;
};

export const EVENT_LIFECYCLE_LABEL: Record<EventLifecycle, string> = {
  ongoing: "진행 중",
  upcoming: "예정",
  past: "종료",
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function normalizeDate(value?: string | null) {
  const match = value?.trim().match(ISO_DATE_PATTERN);
  if (!match) return "";
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? "" : normalized;
}

/** Returns today's calendar date in Korea, independent of the server/browser timezone. */
export function getSeoulDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** Safely resolves legacy eventDate-only rows into a usable start/end range. */
export function resolveEventRange(event: EventDateLike, fallbackDate = getSeoulDateKey()) {
  const legacyDate = normalizeDate(event.eventDate);
  const rawStart = normalizeDate(event.startDate) || legacyDate || normalizeDate(event.endDate) || fallbackDate;
  const rawEnd = normalizeDate(event.endDate) || legacyDate || rawStart;

  // A malformed reversed range is rendered as a one-day event instead of being
  // misclassified or disappearing from the administrator's list.
  return {
    startDate: rawStart,
    endDate: rawEnd < rawStart ? rawStart : rawEnd,
  };
}

export function getEventLifecycle(event: EventDateLike, today = getSeoulDateKey()): EventLifecycle {
  const { startDate, endDate } = resolveEventRange(event, today);
  if (today < startDate) return "upcoming";
  if (today > endDate) return "past";
  return "ongoing";
}

export function isInactiveEventStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  return Boolean(normalized && !["active", "ongoing", "scheduled"].includes(normalized));
}

/**
 * Picks an operationally useful default: soonest-ending current event, nearest
 * upcoming event, then most recently ended event. Inactive events are used only
 * when no active-status event exists.
 */
export function getRecommendedEventId<T extends EventLifecycleLike>(events: T[], today = getSeoulDateKey()) {
  const activeStatusEvents = events.filter((event) => !isInactiveEventStatus(event.status));
  const candidates = activeStatusEvents.length ? activeStatusEvents : events;
  const range = (event: T) => resolveEventRange(event, today);
  const byId = (left: T, right: T) => left.id.localeCompare(right.id);

  const ongoing = candidates
    .filter((event) => getEventLifecycle(event, today) === "ongoing")
    .sort((left, right) => range(left).endDate.localeCompare(range(right).endDate) || range(right).startDate.localeCompare(range(left).startDate) || byId(left, right));
  if (ongoing[0]) return ongoing[0].id;

  const upcoming = candidates
    .filter((event) => getEventLifecycle(event, today) === "upcoming")
    .sort((left, right) => range(left).startDate.localeCompare(range(right).startDate) || byId(left, right));
  if (upcoming[0]) return upcoming[0].id;

  const past = candidates
    .filter((event) => getEventLifecycle(event, today) === "past")
    .sort((left, right) => range(right).endDate.localeCompare(range(left).endDate) || byId(left, right));
  return past[0]?.id ?? "";
}
