"use client";

import { useMemo, useState } from "react";
import {
  EVENT_LIFECYCLE_LABEL,
  getEventLifecycle,
  getSeoulDateKey,
  isInactiveEventStatus,
  resolveEventRange,
  type EventLifecycle,
} from "../../lib/event-lifecycle";

export type DirectoryEvent = {
  id: string;
  name: string;
  status?: string | null;
  eventDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  institution?: string | null;
  participantCount: number;
  clubCount?: number;
  clubs: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

type EventView = "active" | "trash";
type StatusFilter = "all" | EventLifecycle | "inactive";
type SortOrder = "recommended" | "date-asc" | "date-desc" | "name";

type EventDirectoryProps<T extends DirectoryEvent> = {
  events: T[];
  selectedId: string;
  view: EventView;
  loading: boolean;
  busyEventId: string;
  onSelect: (eventId: string) => void;
  onViewChange: (view: EventView) => void;
  onRequestTrash: (event: T) => void;
  onRestore: (event: T) => void;
  onRequestPermanentDelete: (event: T) => void;
};

export default function EventDirectory<T extends DirectoryEvent>({
  events,
  selectedId,
  view,
  loading,
  busyEventId,
  onSelect,
  onViewChange,
  onRequestTrash,
  onRestore,
  onRequestPermanentDelete,
}: EventDirectoryProps<T>) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recommended");
  const today = getSeoulDateKey();

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return events
      .filter((event) => {
        const lifecycle = getEventLifecycle(event, today);
        const matchesText = !normalizedQuery || `${event.name} ${event.location || ""} ${event.institution || ""}`.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
        const matchesStatus = statusFilter === "all"
          || (statusFilter === "inactive" ? isInactiveEventStatus(event.status) : lifecycle === statusFilter);
        return matchesText && matchesStatus;
      })
      .sort((left, right) => view === "trash" && sortOrder === "recommended"
        ? (right.deletedAt || "").localeCompare(left.deletedAt || "")
        : compareEvents(left, right, sortOrder, today));
  }, [events, query, sortOrder, statusFilter, today, view]);

  const currentAndUpcoming = filteredEvents.filter((event) => getEventLifecycle(event, today) !== "past");
  const past = filteredEvents.filter((event) => getEventLifecycle(event, today) === "past");

  return (
    <section className="event-directory" id="events" aria-labelledby="event-directory-title">
      <div className="event-directory-heading">
        <div>
          <p>EVENT WORKSPACE</p>
          <h2 id="event-directory-title">행사 찾기</h2>
          <span>대한민국 날짜 기준으로 운영할 행사를 빠르게 선택하세요.</span>
        </div>
        <div className="event-view-tabs" role="tablist" aria-label="행사 보관 상태">
          <button role="tab" aria-selected={view === "active"} className={view === "active" ? "active" : ""} onClick={() => onViewChange("active")}>운영 행사</button>
          <button role="tab" aria-selected={view === "trash"} className={view === "trash" ? "active" : ""} onClick={() => onViewChange("trash")}>휴지통</button>
        </div>
      </div>

      <div className="event-directory-tools">
        <label className="event-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">행사명, 장소 또는 기관 검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="행사명, 장소 또는 기관 검색" />
        </label>
        <label>
          <span className="sr-only">상태 필터</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="행사 상태 필터">
            <option value="all">모든 상태</option>
            <option value="ongoing">진행 중</option>
            <option value="upcoming">예정</option>
            <option value="past">종료</option>
            <option value="inactive">비활성·보관</option>
          </select>
        </label>
        <label>
          <span className="sr-only">행사 정렬</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} aria-label="행사 정렬">
            <option value="recommended">{view === "trash" ? "최근 삭제 순" : "추천 순서"}</option>
            <option value="date-asc">날짜 빠른 순</option>
            <option value="date-desc">날짜 늦은 순</option>
            <option value="name">이름 순</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="event-directory-loading" role="status"><span />행사 목록을 불러오는 중입니다.</div>
      ) : view === "trash" ? (
        <EventGroup title="휴지통" subtitle="복구하거나 영구 삭제할 수 있습니다." events={filteredEvents} emptyMessage={query || statusFilter !== "all" ? "검색 조건에 맞는 삭제 행사가 없습니다." : "휴지통이 비어 있습니다."} renderEvent={(event) => (
          <EventCard
            key={event.id}
            event={event}
            selected={false}
            view={view}
            busy={busyEventId === event.id}
            onSelect={onSelect}
            onRequestTrash={onRequestTrash}
            onRestore={onRestore}
            onRequestPermanentDelete={onRequestPermanentDelete}
          />
        )} />
      ) : (
        <div className="event-groups">
          <EventGroup title="진행 중·예정 행사" subtitle="오늘 참여할 수 있는 행사와 앞으로 열릴 행사" events={currentAndUpcoming} emptyMessage={query || statusFilter !== "all" ? "검색 조건에 맞는 진행 중·예정 행사가 없습니다." : "진행 중이거나 예정된 행사가 없습니다."} renderEvent={(event) => (
            <EventCard key={event.id} event={event} selected={selectedId === event.id} view={view} busy={busyEventId === event.id} onSelect={onSelect} onRequestTrash={onRequestTrash} onRestore={onRestore} onRequestPermanentDelete={onRequestPermanentDelete} />
          )} />
          <EventGroup title="지난 행사" subtitle="종료일이 지난 행사" events={past} emptyMessage={query || statusFilter !== "all" ? "검색 조건에 맞는 지난 행사가 없습니다." : "아직 종료된 행사가 없습니다."} renderEvent={(event) => (
            <EventCard key={event.id} event={event} selected={selectedId === event.id} view={view} busy={busyEventId === event.id} onSelect={onSelect} onRequestTrash={onRequestTrash} onRestore={onRestore} onRequestPermanentDelete={onRequestPermanentDelete} />
          )} />
        </div>
      )}
    </section>
  );
}

function EventGroup<T extends DirectoryEvent>({ title, subtitle, events, emptyMessage, renderEvent }: { title: string; subtitle: string; events: T[]; emptyMessage: string; renderEvent: (event: T) => React.ReactNode }) {
  return (
    <section className="event-group" aria-label={title}>
      <header><div><h3>{title}</h3><p>{subtitle}</p></div><span>{events.length}개</span></header>
      {events.length ? <div className="event-card-grid">{events.map(renderEvent)}</div> : <div className="event-group-empty"><span>◇</span><p>{emptyMessage}</p></div>}
    </section>
  );
}

function EventCard<T extends DirectoryEvent>({ event, selected, view, busy, onSelect, onRequestTrash, onRestore, onRequestPermanentDelete }: {
  event: T;
  selected: boolean;
  view: EventView;
  busy: boolean;
  onSelect: (id: string) => void;
  onRequestTrash: (event: T) => void;
  onRestore: (event: T) => void;
  onRequestPermanentDelete: (event: T) => void;
}) {
  const lifecycle = getEventLifecycle(event);
  const range = resolveEventRange(event);
  const inactive = isInactiveEventStatus(event.status);
  const activity = event.updatedAt || event.createdAt;
  const clubCount = event.clubCount ?? event.clubs.length;

  return (
    <article className={`event-list-card ${selected ? "selected" : ""} ${view === "trash" ? "trashed" : ""}`}>
      <div className="event-card-badges">
        <span className={`event-status-badge ${lifecycle}`}>{EVENT_LIFECYCLE_LABEL[lifecycle]}</span>
        {inactive && <span className="event-status-badge inactive">비활성</span>}
        {selected && <span className="event-selected-badge">선택됨</span>}
      </div>
      <h4>{event.name}</h4>
      <dl className="event-list-meta">
        <div><dt>기간</dt><dd>{formatShortPeriod(range.startDate, range.endDate)}</dd></div>
        <div><dt>장소</dt><dd>{event.location || "장소 미정"}</dd></div>
        <div><dt>참가자</dt><dd>{event.participantCount.toLocaleString()}명</dd></div>
        <div><dt>동아리</dt><dd>{clubCount.toLocaleString()}개</dd></div>
      </dl>
      <p className="event-last-activity">{view === "trash" ? "삭제" : activity === event.updatedAt ? "최근 변경" : "생성"} · {formatActivity(view === "trash" ? event.deletedAt : activity)}</p>
      <div className="event-card-actions">
        {view === "active" ? (
          <>
            <button className="event-select-button" aria-pressed={selected} onClick={() => onSelect(event.id)}>{selected ? "선택된 행사" : "이 행사 관리"}</button>
            <details>
              <summary aria-label={`${event.name} 관리 메뉴`}>•••</summary>
              <div><button disabled={busy} onClick={() => onRequestTrash(event)}>휴지통으로 이동</button></div>
            </details>
          </>
        ) : (
          <>
            <button className="event-select-button" disabled={busy} onClick={() => onRestore(event)}>{busy ? "처리 중…" : "복구"}</button>
            <button className="event-permanent-button" disabled={busy} onClick={() => onRequestPermanentDelete(event)}>영구 삭제</button>
          </>
        )}
      </div>
    </article>
  );
}

function compareEvents<T extends DirectoryEvent>(left: T, right: T, sortOrder: SortOrder, today: string) {
  if (sortOrder === "name") return left.name.localeCompare(right.name, "ko-KR");
  const leftRange = resolveEventRange(left, today);
  const rightRange = resolveEventRange(right, today);
  if (sortOrder === "date-asc") return leftRange.startDate.localeCompare(rightRange.startDate) || left.name.localeCompare(right.name, "ko-KR");
  if (sortOrder === "date-desc") return rightRange.startDate.localeCompare(leftRange.startDate) || left.name.localeCompare(right.name, "ko-KR");
  const operationalDifference = Number(isInactiveEventStatus(left.status)) - Number(isInactiveEventStatus(right.status));
  if (operationalDifference) return operationalDifference;
  const rank: Record<EventLifecycle, number> = { ongoing: 0, upcoming: 1, past: 2 };
  const leftLifecycle = getEventLifecycle(left, today);
  const rightLifecycle = getEventLifecycle(right, today);
  const lifecycleDifference = rank[leftLifecycle] - rank[rightLifecycle];
  if (lifecycleDifference) return lifecycleDifference;
  if (leftLifecycle === "ongoing") return leftRange.endDate.localeCompare(rightRange.endDate);
  if (leftLifecycle === "upcoming") return leftRange.startDate.localeCompare(rightRange.startDate);
  return rightRange.endDate.localeCompare(leftRange.endDate);
}

function formatShortPeriod(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  const start = formatter.format(new Date(`${startDate}T00:00:00`));
  if (startDate === endDate) return start;
  return `${start} – ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
}

function formatActivity(value?: string | null) {
  if (!value) return "기록 없음";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}
