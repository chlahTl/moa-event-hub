"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";
import EventDirectory from "./EventDirectory";
import {
  EVENT_LIFECYCLE_LABEL,
  getEventLifecycle,
  getRecommendedEventId,
  getSeoulDateKey,
  isInactiveEventStatus,
  resolveEventRange,
} from "../../lib/event-lifecycle";

type Club = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  stampEmoji: string;
  stampMessage: string;
  submissionGuide: string;
  collectGender: boolean;
  collectAge: boolean;
  responseCount: number;
};

type StampPoint = {
  id: string;
  eventId: string;
  token: string;
  name: string;
  description: string;
  position: number;
  active: boolean;
};

type EventItem = {
  id: string;
  name: string;
  description: string;
  institution: string;
  eventDate: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  inviteToken: string;
  location: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  clubCount?: number;
  responseCount: number;
  participantCount: number;
  clubs: Club[];
  stampPoints: StampPoint[];
};

type ShareQr = {
  title: string;
  kicker: string;
  intro: string;
  label: string;
  link: string;
  filename: string;
};

type StatItem = { label: string; total: number };
type RecentItem = { id: string; clubName: string; participantName: string; gender: string | null; ageGroup: string | null; createdAt: string };
type Stats = { gender: StatItem[]; age: StatItem[]; recent: RecentItem[] };

type DeletionImpact = {
  clubCount: number;
  participantCount: number;
  responseCount: number;
  stampPointCount: number;
  stampRecordCount: number;
  clubStampRecordCount: number;
};

type EventDeletionAction = { kind: "trash" | "permanent"; event: EventItem; impact: DeletionImpact };
type EventView = "active" | "trash";

type AdminDashboardProps = {
  adminName?: string | null;
  adminEmail?: string | null;
  signOutHref?: string | null;
};

const EMPTY_STATS: Stats = { gender: [], age: [], recent: [] };
const SELECTED_EVENT_STORAGE_KEY = "moa.admin.selectedEventId";

export default function AdminDashboard({ adminName, adminEmail, signOutHref }: AdminDashboardProps = {}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [eventView, setEventView] = useState<EventView>("active");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [statsReloadToken, setStatsReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"event" | "club" | "editClub" | "stampPoint" | "qr" | null>(null);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [shareQr, setShareQr] = useState<ShareQr | null>(null);
  const [qrData, setQrData] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [busyEventId, setBusyEventId] = useState("");
  const [deletionAction, setDeletionAction] = useState<EventDeletionAction | null>(null);
  const [deletionError, setDeletionError] = useState("");
  const [undoEvent, setUndoEvent] = useState<{ id: string; name: string } | null>(null);
  const eventLoadSequenceRef = useRef(0);
  const operationLockRef = useRef("");
  const qrLockRef = useRef(false);
  const eventOperationLockRef = useRef("");

  const selected = eventView === "active" ? events.find((event) => event.id === selectedId) ?? events[0] : undefined;
  const displayName = adminName?.trim() || adminEmail?.split("@")[0] || "관리자";
  const avatarLabel = Array.from(displayName)[0] || "관";

  const loadEvents = useCallback(async (preferredId: string | undefined, view: EventView) => {
    const requestId = ++eventLoadSequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/events?view=${view}`, { cache: "no-store" });
      const data = await readApiResponse<{ events?: EventItem[] }>(response, "행사를 불러오지 못했습니다.");
      if (requestId !== eventLoadSequenceRef.current) return;
      const nextEvents = data.events ?? [];
      setEvents(nextEvents);
      if (view === "active") {
        setSelectedId((current) => {
          const stored = window.localStorage.getItem(SELECTED_EVENT_STORAGE_KEY) || "";
          const nextId = [preferredId, current, stored].find((candidate) => candidate && nextEvents.some((item) => item.id === candidate))
            || getRecommendedEventId(nextEvents);
          if (!nextId) window.localStorage.removeItem(SELECTED_EVENT_STORAGE_KEY);
          return nextId;
        });
      }
    } catch (caught) {
      if (requestId === eventLoadSequenceRef.current) throw new Error(friendlyError(caught, "행사를 불러오지 못했습니다."));
    } finally {
      if (requestId === eventLoadSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(undefined, "active").catch((caught) => {
      setError(friendlyError(caught, "행사를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    });
  }, [loadEvents]);

  useEffect(() => {
    if (eventView === "active" && selectedId && events.some((event) => event.id === selectedId)) {
      window.localStorage.setItem(SELECTED_EVENT_STORAGE_KEY, selectedId);
    }
  }, [eventView, events, selectedId]);

  useEffect(() => {
    if (!undoEvent) return;
    const timer = window.setTimeout(() => setUndoEvent(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undoEvent]);

  useEffect(() => {
    if (eventView !== "active" || !selected?.id) {
      setStats(EMPTY_STATS);
      return;
    }
    const controller = new AbortController();
    setStats(EMPTY_STATS);
    fetch(`/api/stats?eventId=${encodeURIComponent(selected.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await readApiResponse<Stats>(response, "통계를 불러오지 못했습니다.");
        setStats(data);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(friendlyError(caught, "통계를 불러오지 못했습니다."));
        }
      });
    return () => controller.abort();
  }, [eventView, selected?.id, selected?.responseCount, statsReloadToken]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function beginOperation(action: string) {
    if (operationLockRef.current) return false;
    operationLockRef.current = action;
    setBusyAction(action);
    return true;
  }

  function finishOperation(action: string) {
    if (operationLockRef.current !== action) return;
    operationLockRef.current = "";
    setBusyAction("");
  }

  function beginEventOperation(eventId: string) {
    if (eventOperationLockRef.current) return false;
    eventOperationLockRef.current = eventId;
    setBusyEventId(eventId);
    return true;
  }

  function finishEventOperation(eventId: string) {
    if (eventOperationLockRef.current !== eventId) return;
    eventOperationLockRef.current = "";
    setBusyEventId("");
  }

  async function changeEventView(view: EventView) {
    if (view === eventView) return;
    setError("");
    setEventView(view);
    setEvents([]);
    try {
      await loadEvents(undefined, view);
    } catch (caught) {
      setError(friendlyError(caught, "행사 목록을 불러오지 못했습니다. 다시 시도해 주세요."));
    }
  }

  async function retryEventLoad() {
    setError("");
    try {
      await loadEvents(undefined, eventView);
      setStatsReloadToken((current) => current + 1);
    } catch (caught) {
      setError(friendlyError(caught, "행사 목록을 불러오지 못했습니다. 다시 시도해 주세요."));
    }
  }

  function selectEvent(eventId: string) {
    setSelectedId(eventId);
    window.localStorage.setItem(SELECTED_EVENT_STORAGE_KEY, eventId);
    window.requestAnimationFrame(() => document.querySelector("#selected-event-details")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function requestEventDeletion(event: EventItem, kind: EventDeletionAction["kind"]) {
    if (!beginEventOperation(event.id)) return;
    setError("");
    setDeletionError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.id)}/deletion-impact`, { cache: "no-store" });
      const data = await readApiResponse<{ impact?: DeletionImpact }>(response, "삭제 영향을 확인하지 못했습니다.");
      if (!data.impact) throw new Error("삭제 영향을 확인하지 못했습니다.");
      setDeletionAction({ kind, event, impact: data.impact });
    } catch (caught) {
      setError(friendlyError(caught, "삭제 영향을 확인하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishEventOperation(event.id);
    }
  }

  async function moveEventToTrash() {
    if (!deletionAction || deletionAction.kind !== "trash") return;
    const target = deletionAction.event;
    if (!beginEventOperation(target.id)) return;
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(target.id)}`, { method: "DELETE" });
      await readApiResponse(response, "행사를 휴지통으로 이동하지 못했습니다.");
      setDeletionAction(null);
      setDeletionError("");
      setUndoEvent({ id: target.id, name: target.name });
      await loadEvents(undefined, "active");
    } catch (caught) {
      setDeletionError(friendlyError(caught, "행사를 휴지통으로 이동하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishEventOperation(target.id);
    }
  }

  async function restoreEvent(event: Pick<EventItem, "id" | "name">, fromUndo = false) {
    if (!beginEventOperation(event.id)) return;
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.id)}/restore`, { method: "POST" });
      await readApiResponse(response, "행사를 복구하지 못했습니다.");
      setUndoEvent(null);
      if (fromUndo) {
        setEventView("active");
        await loadEvents(event.id, "active");
      } else {
        await loadEvents(undefined, eventView);
      }
      notify(`“${event.name}” 행사를 복구했습니다.`);
    } catch (caught) {
      setError(friendlyError(caught, "행사를 복구하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishEventOperation(event.id);
    }
  }

  async function permanentlyDeleteEvent(confirmationName: string) {
    if (!deletionAction || deletionAction.kind !== "permanent") return;
    const target = deletionAction.event;
    if (!beginEventOperation(target.id)) return;
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(target.id)}/permanent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationName }),
      });
      await readApiResponse(response, "행사를 영구 삭제하지 못했습니다.");
      setDeletionAction(null);
      setDeletionError("");
      await loadEvents(undefined, "trash");
      notify(`“${target.name}” 행사를 영구 삭제했습니다.`);
    } catch (caught) {
      setDeletionError(friendlyError(caught, "행사를 영구 삭제하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishEventOperation(target.id);
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const operation = "create-event";
    if (!beginOperation(operation)) return;
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await readApiResponse<{ event?: EventItem }>(response, "새 행사를 만들지 못했습니다.");
      if (!data.event) throw new Error("행사 생성 결과를 확인하지 못했습니다.");
      setEventView("active");
      await loadEvents(data.event.id, "active");
      notify("새 행사를 만들었습니다.");
      await openShareQr({
        title: data.event.name,
        kicker: "EVENT INVITE QR · READY",
        intro: "참가자가 처음 스캔해 행사 정보와 이름을 등록하는 초대 QR입니다.",
        label: "행사 참가 등록",
        link: `${window.location.origin}/join/${data.event.inviteToken}`,
        filename: `${data.event.name}-초대-QR.png`,
      });
    } catch (caught) {
      setError(friendlyError(caught, "새 행사를 만들지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요."));
    } finally {
      finishOperation(operation);
    }
  }

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const operation = "create-club";
    if (!beginOperation(operation)) return;
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selected.id,
          name: form.get("name"),
          description: form.get("description"),
          stampEmoji: form.get("stampEmoji"),
          stampMessage: form.get("stampMessage"),
          submissionGuide: form.get("submissionGuide"),
          collectGender: form.get("collectGender") === "on",
          collectAge: form.get("collectAge") === "on",
        }),
      });
      await readApiResponse(response, "동아리를 만들지 못했습니다.");
      setModal(null);
      await loadEvents(selected.id, "active");
      notify("동아리와 전용 QR을 만들었습니다.");
    } catch (caught) {
      setError(friendlyError(caught, "동아리를 만들지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishOperation(operation);
    }
  }

  async function updateClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingClub) return;
    const operation = `update-club:${editingClub.id}`;
    if (!beginOperation(operation)) return;
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/clubs/${encodeURIComponent(editingClub.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          stampEmoji: form.get("stampEmoji"),
          stampMessage: form.get("stampMessage"),
          submissionGuide: form.get("submissionGuide"),
          collectGender: form.get("collectGender") === "on",
          collectAge: form.get("collectAge") === "on",
        }),
      });
      await readApiResponse(response, "동아리를 수정하지 못했습니다.");
      setModal(null);
      setEditingClub(null);
      await loadEvents(selected.id, "active");
      notify("동아리와 스탬프 안내를 수정했습니다.");
    } catch (caught) {
      setError(friendlyError(caught, "동아리를 수정하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishOperation(operation);
    }
  }

  async function deleteClub(club: Club) {
    if (!selected) return;
    const confirmed = window.confirm(`“${club.name}” 동아리를 삭제할까요?\n참여 실적과 스탬프 기록도 함께 삭제되며 복구할 수 없습니다.`);
    if (!confirmed) return;
    const operation = `delete-club:${club.id}`;
    if (!beginOperation(operation)) return;
    setError("");
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(club.id)}`, { method: "DELETE" });
      await readApiResponse(response, "동아리를 삭제하지 못했습니다.");
      await loadEvents(selected.id, "active");
      notify("동아리와 관련 기록을 삭제했습니다.");
    } catch (caught) {
      setError(friendlyError(caught, "동아리를 삭제하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishOperation(operation);
    }
  }

  function openClubEdit(club: Club) {
    setError("");
    setEditingClub(club);
    setModal("editClub");
  }

  async function createStampPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const operation = "create-stamp-point";
    if (!beginOperation(operation)) return;
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/stamp-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selected.id, name: form.get("name"), description: form.get("description") }),
      });
      const data = await readApiResponse<{ point?: StampPoint }>(response, "추가 지점을 만들지 못했습니다.");
      if (!data.point) throw new Error("추가 지점 생성 결과를 확인하지 못했습니다.");
      await loadEvents(selected.id, "active");
      notify("스탬프 지점과 전용 QR을 만들었습니다.");
      await openStampQr(data.point);
    } catch (caught) {
      setError(friendlyError(caught, "추가 지점을 만들지 못했습니다. 다시 시도해 주세요."));
    } finally {
      finishOperation(operation);
    }
  }

  async function openShareQr(qr: ShareQr) {
    if (qrLockRef.current) return;
    qrLockRef.current = true;
    setQrBusy(true);
    setError("");
    setShareQr(qr);
    setQrData("");
    setModal("qr");
    try {
      setQrData(await QRCode.toDataURL(qr.link, { width: 720, margin: 2, color: { dark: "#123d37", light: "#ffffff" } }));
    } catch (caught) {
      setModal(null);
      setShareQr(null);
      setError(friendlyError(caught, "QR 이미지를 만들지 못했습니다. 다시 시도해 주세요."));
    } finally {
      qrLockRef.current = false;
      setQrBusy(false);
    }
  }

  function openClubQr(club: Club) {
    return openShareQr({
      title: club.name,
      kicker: "CLUB QR · READY",
      intro: "행사 참가자가 스캔하면 이름을 다시 묻지 않고 이 동아리의 참여 스탬프가 자동 등록됩니다.",
      label: `기본 스탬프 · ${club.name}`,
      link: `${window.location.origin}/visit/${club.id}`,
      filename: `${club.name}-QR.png`,
    });
  }

  function openEventQr(event: EventItem) {
    return openShareQr({
      title: event.name,
      kicker: "EVENT INVITE QR · READY",
      intro: "참가자가 최초 한 번 정보를 등록하고 스탬프 투어를 시작하는 초대 QR입니다.",
      label: "행사 참가 등록",
      link: `${window.location.origin}/join/${event.inviteToken}`,
      filename: `${event.name}-초대-QR.png`,
    });
  }

  function openStampQr(point: StampPoint) {
    return openShareQr({
      title: point.name,
      kicker: "STAMP POINT QR · READY",
      intro: "행사장에 비치할 지점 QR입니다. 등록된 참가자가 스캔하면 스탬프가 자동 저장됩니다.",
      label: "스탬프 획득",
      link: `${window.location.origin}/stamp/${point.token}`,
      filename: `${point.name}-스탬프-QR.png`,
    });
  }

  const selectedLifecycle = selected ? getEventLifecycle(selected) : null;
  const selectedRange = selected ? resolveEventRange(selected) : null;
  const selectedInactive = isInactiveEventStatus(selected?.status);
  const selectedStatus = selectedLifecycle
    ? `${selectedInactive ? "비활성 · " : ""}${EVENT_LIFECYCLE_LABEL[selectedLifecycle]}`
    : "—";

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" target="_top" className="brand-lockup brand-admin"><span className="brand-mark">ㅁ</span><span>모아</span></a>
        <p className="workspace-label">NCHM 연계 운영</p>
        <nav className="side-nav" aria-label="관리자 메뉴">
          <a href="#overview" className="active"><span>⌂</span>대시보드</a>
          <a href="#events"><span>◇</span>행사 관리</a>
          <a href="#clubs"><span>⌗</span>동아리 스탬프</a>
          <a href="#stamps"><span>＋</span>추가 지점</a>
          <a href="#responses"><span>≡</span>응답 내역</a>
          <a href="#integration"><span>↔</span>연동 안내</a>
        </nav>
        <div className="sidebar-help">
          <span className="status-dot" /> 독립 운영 중
          <p>NCHM Visite와 연결하지 않아도 바로 사용할 수 있습니다.</p>
        </div>
        <a href="/" target="_top" className="back-link">← 소개 화면으로</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="breadcrumb">관리자 / 대시보드</p>
            <h1>안녕하세요, {displayName}님.</h1>
          </div>
          <div className="topbar-actions">
            {signOutHref && <a className="admin-signout" href={signOutHref}>로그아웃</a>}
            <button className="button button-primary small" disabled={Boolean(busyAction)} onClick={() => { setError(""); setModal("event"); }}>＋ 새 행사</button>
            <div className="avatar" aria-label={`${displayName} 관리자${adminEmail ? `, ${adminEmail}` : ""}`} title={adminEmail || displayName}>{avatarLabel}</div>
          </div>
        </header>

        {error && <div className="error-banner" role="alert"><span>!</span>{error}<button className="error-retry" onClick={() => void retryEventLoad()}>목록 새로고침</button><button onClick={() => setError("")} aria-label="오류 닫기">×</button></div>}

        <div className="admin-content" id="overview">
          <EventDirectory
            events={events}
            selectedId={selectedId}
            view={eventView}
            loading={loading}
            busyEventId={busyEventId}
            onSelect={selectEvent}
            onViewChange={(view) => void changeEventView(view)}
            onRequestTrash={(event) => void requestEventDeletion(event, "trash")}
            onRestore={(event) => void restoreEvent(event)}
            onRequestPermanentDelete={(event) => void requestEventDeletion(event, "permanent")}
          />

          {eventView === "trash" ? null : loading ? null : !selected ? (
            <EmptyState onCreate={() => setModal("event")} />
          ) : (
            <div id="selected-event-details" className="selected-event-details">
              <div className="event-spotlight">
                <div>
                  <p className="eyebrow light"><span /> SELECTED EVENT</p>
                  <h2>{selected.name}</h2>
                  <div className="spotlight-status-line"><span className={`event-status-badge ${selectedInactive ? "inactive" : selectedLifecycle}`}>{selectedStatus}</span><p>{formatPeriod(selected)} · {selected.location || "장소 미정"} · {selected.institution}</p></div>
                  {selected.description && <p className="spotlight-description">{selected.description}</p>}
                </div>
                <div className="spotlight-number"><strong>{selected.participantCount}</strong><span>행사 참가자</span></div>
                <div className="spotlight-actions">
                  <button disabled={Boolean(busyAction)} onClick={() => setModal("club")}>동아리 추가 <span>＋</span></button>
                  <button className="secondary-spotlight" disabled={qrBusy} onClick={() => openEventQr(selected)}>초대 QR <span>⌗</span></button>
                  <a href="#stamps">추가 지점 관리 <span>＋</span></a>
                </div>
              </div>

              <div className="event-summary-grid" aria-label={`${selected.name} 운영 요약`}>
                <EventFact label="상태" value={selectedStatus} note="대한민국 날짜 기준" symbol="◇" />
                <EventFact label="기간" value={selectedRange ? formatCompactPeriod(selectedRange.startDate, selectedRange.endDate) : "—"} note="시작일 – 종료일" symbol="◷" />
                <EventFact label="장소" value={selected.location || "장소 미정"} note={selected.institution} symbol="⌖" />
                <EventFact label="참가자" value={`${selected.participantCount.toLocaleString()}명`} note="행사 등록 기준" symbol="↗" />
                <EventFact label="동아리" value={`${selected.clubs.length.toLocaleString()}개`} note="기본 스탬프 QR" symbol="◫" />
                <EventFact label="최근 활동" value={formatSummaryActivity(selected.updatedAt || selected.createdAt)} note={selected.updatedAt ? "최근 변경" : "행사 생성"} symbol="↻" />
              </div>

              <section className="dashboard-section" id="clubs">
                <div className="dashboard-heading">
                  <div><p>기본 스탬프 · 동아리 QR</p><h2>동아리 참여 스탬프</h2></div>
                  <button className="subtle-button" disabled={Boolean(busyAction)} onClick={() => setModal("club")}>＋ 동아리 추가</button>
                </div>
                {selected.clubs.length ? (
                  <div className="club-grid">
                    {selected.clubs.map((club, index) => (
                      <article className="club-card" key={club.id}>
                        <div className="club-card-top"><span>{club.stampEmoji || String(index + 1).padStart(2, "0")}</span><button disabled={qrBusy} onClick={() => openClubQr(club)} aria-label={`${club.name} QR 보기`}>⌗</button></div>
                        <h3>{club.name}</h3>
                        <p>{club.description || "동아리 전용 참여 입력"}</p>
                        <div className="field-tags">
                          <span>이름</span>
                          {club.collectGender && <span>성별</span>}
                          {club.collectAge && <span>연령 구분</span>}
                        </div>
                        <div className="club-card-footer"><strong>{club.responseCount}<small>명</small></strong><button disabled={qrBusy} onClick={() => openClubQr(club)}>기본 스탬프 QR →</button></div>
                        <div className="club-manage-actions">
                          <button disabled={Boolean(busyAction)} onClick={() => openClubEdit(club)}>수정</button>
                          <a href={`/api/export?eventId=${selected.id}&clubId=${club.id}`}>실적 CSV ↓</a>
                          <button className="danger" disabled={Boolean(busyAction)} onClick={() => void deleteClub(club)}>{busyAction === `delete-club:${club.id}` ? "삭제 중…" : "삭제"}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <button className="empty-clubs" onClick={() => setModal("club")}><span>＋</span><strong>첫 동아리 스탬프 만들기</strong><small>동아리를 추가하면 기본 참여 QR이 바로 만들어집니다.</small></button>
                )}
              </section>

              <section className="dashboard-section" id="stamps">
                <div className="dashboard-heading">
                  <div><p>선택 기능 · EXTRA POINTS</p><h2>추가 지점 QR</h2></div>
                  <div className="heading-actions">
                    <button className="subtle-button" disabled={qrBusy} onClick={() => openEventQr(selected)}>초대 QR 보기</button>
                    <button className="subtle-button" disabled={Boolean(busyAction)} onClick={() => setModal("stampPoint")}>＋ 추가 지점</button>
                  </div>
                </div>
                {selected.stampPoints.length ? (
                  <div className="stamp-admin-grid">
                    {selected.stampPoints.map((point, index) => (
                      <article className="stamp-admin-card" key={point.id}>
                        <div className="stamp-admin-number">{String(index + 1).padStart(2, "0")}</div>
                        <div><h3>{point.name}</h3><p>{point.description || "현장에서 QR을 스캔해 방문을 인증합니다."}</p></div>
                        <span className={point.active ? "active" : "inactive"}>{point.active ? "운영 중" : "비활성"}</span>
                        <button disabled={qrBusy} onClick={() => openStampQr(point)}>QR 보기 · 저장 →</button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <button className="empty-clubs" onClick={() => setModal("stampPoint")}><span>⌗</span><strong>선택: 추가 지점 만들기</strong><small>동아리 외에 포토존·체험 부스 등이 필요할 때만 사용합니다.</small></button>
                )}
              </section>

              <div className="analytics-grid">
                <section className="panel" id="responses">
                  <div className="panel-heading"><div><p>응답 분포</p><h2>연령 구분</h2></div><span>실시간</span></div>
                  <AgeChart items={stats.age} total={selected.responseCount} />
                </section>
                <section className="panel">
                  <div className="panel-heading"><div><p>응답 분포</p><h2>성별</h2></div><span>실시간</span></div>
                  <GenderChart items={stats.gender} total={selected.responseCount} />
                </section>
              </div>

              <section className="panel response-panel">
                <div className="panel-heading"><div><p>최근 활동</p><h2>최근 응답</h2></div><a href={`/api/export?eventId=${selected.id}`}>전체 실적 CSV ↓</a></div>
                <RecentTable items={stats.recent} />
              </section>

              <section className="integration-card" id="integration">
                <div className="integration-icon">↔</div>
                <div><span>연동 준비</span><h2>NCHM Visite는 나중에 연결할 수 있습니다.</h2><p>현재는 독립적으로 안전하게 운영하고, 추후 Visite가 제공하는 API 또는 정기 CSV 가져오기 방식에 맞춰 연결합니다.</p></div>
                <div className="integration-route"><small>현재 권장 흐름</small><strong>모아 저장소</strong><i>→</i><strong>CSV / REST API</strong><i>→</i><strong>NCHM Visite</strong></div>
              </section>
            </div>
          )}
        </div>
      </section>

      {modal === "event" && <EventModal busy={busyAction === "create-event"} onClose={() => { if (!busyAction) setModal(null); }} onSubmit={createEvent} />}
      {modal === "club" && selected && <ClubModal busy={busyAction === "create-club"} eventName={selected.name} onClose={() => { if (!busyAction) setModal(null); }} onSubmit={createClub} />}
      {modal === "editClub" && selected && editingClub && <ClubModal busy={busyAction === `update-club:${editingClub.id}`} eventName={selected.name} club={editingClub} onClose={() => { if (!busyAction) { setModal(null); setEditingClub(null); } }} onSubmit={updateClub} />}
      {modal === "stampPoint" && selected && <StampPointModal busy={busyAction === "create-stamp-point"} eventName={selected.name} onClose={() => { if (!busyAction) setModal(null); }} onSubmit={createStampPoint} />}
      {modal === "qr" && shareQr && <QrModal qr={shareQr} data={qrData} busy={qrBusy} onClose={() => setModal(null)} onNotify={notify} />}
      {deletionAction && (
        <EventDeletionModal
          action={deletionAction}
          busy={busyEventId === deletionAction.event.id}
          error={deletionError}
          onClose={() => { if (!busyEventId) { setDeletionAction(null); setDeletionError(""); } }}
          onMoveToTrash={() => void moveEventToTrash()}
          onPermanentDelete={(confirmationName) => void permanentlyDeleteEvent(confirmationName)}
        />
      )}
      {undoEvent && <div className="undo-toast" role="status" aria-live="polite"><div><strong>행사를 휴지통으로 이동했습니다.</strong><span>“{undoEvent.name}” · 10초 동안 바로 되돌릴 수 있습니다.</span></div><button disabled={busyEventId === undoEvent.id} onClick={() => void restoreEvent(undoEvent, true)}>실행 취소</button><button className="undo-close" onClick={() => setUndoEvent(null)} aria-label="알림 닫기">×</button></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <div className="empty-illustration"><span>＋</span><i /><i /><i /></div>
      <p className="eyebrow"><span /> READY TO START</p>
      <h2>첫 행사를 만들어 볼까요?</h2>
      <p>행사를 만든 뒤 동아리를 추가하면 각 동아리 QR이 기본 참여 스탬프로 사용됩니다. 추가 지점은 필요할 때만 더할 수 있습니다.</p>
      <button className="button button-primary" onClick={onCreate}>새 행사 만들기 →</button>
    </section>
  );
}

function EventFact({ label, value, note, symbol }: { label: string; value: string; note: string; symbol: string }) {
  return <article className="event-fact-card"><div className="metric-icon" aria-hidden="true">{symbol}</div><p>{label}</p><strong title={value}>{value}</strong><span>{note}</span></article>;
}

function AgeChart({ items, total }: { items: StatItem[]; total: number }) {
  const max = Math.max(...items.map((item) => item.total), 1);
  if (!items.length) return <ChartEmpty />;
  return <div className="bar-chart">{items.map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.total / max) * 100}%` }} /></div><strong>{item.total}</strong></div>)}<small>전체 응답 {total}명 기준</small></div>;
}

function GenderChart({ items, total }: { items: StatItem[]; total: number }) {
  const female = items.find((item) => item.label === "여성")?.total ?? 0;
  const male = items.find((item) => item.label === "남성")?.total ?? 0;
  const other = Math.max(total - female - male, 0);
  const denominator = Math.max(female + male + other, 1);
  const femalePct = Math.round((female / denominator) * 100);
  const malePct = Math.round((male / denominator) * 100);
  if (!items.length) return <ChartEmpty />;
  return <div className="donut-wrap"><div className="donut" style={{ background: `conic-gradient(#f06d54 0 ${femalePct}%, #123d37 ${femalePct}% ${femalePct + malePct}%, #cbd8d3 ${femalePct + malePct}% 100%)` }}><div><strong>{total}</strong><span>응답</span></div></div><div className="donut-legend"><p><i className="coral" />여성 <strong>{female}</strong></p><p><i className="teal" />남성 <strong>{male}</strong></p>{other > 0 && <p><i className="gray" />기타 <strong>{other}</strong></p>}</div></div>;
}

function ChartEmpty() {
  return <div className="chart-empty"><span>⌁</span><strong>아직 응답이 없습니다.</strong><p>QR 입력이 들어오면 여기에 바로 표시됩니다.</p></div>;
}

function RecentTable({ items }: { items: RecentItem[] }) {
  if (!items.length) return <div className="table-empty">첫 응답이 들어오면 동아리별로 자동 분류됩니다.</div>;
  return <div className="table-wrap"><table><thead><tr><th>이름</th><th>동아리</th><th>성별</th><th>연령 구분</th><th>입력 일시</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="table-dot" />{item.participantName || "—"}</td><td>{item.clubName}</td><td>{item.gender || "—"}</td><td>{item.ageGroup || "—"}</td><td>{formatDateTime(item.createdAt)}</td></tr>)}</tbody></table></div>;
}

function ModalShell({ title, kicker, closeDisabled = false, onClose, children }: { title: string; kicker: string; closeDisabled?: boolean; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>("[autofocus]");
      const fallback = dialogRef.current?.querySelector<HTMLElement>("button:not(.modal-close), input, textarea, select, .modal-close");
      (preferred || fallback)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!closeDisabled) onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <div className="modal-backdrop" role="presentation"><dialog ref={dialogRef} className="modal" open aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}><button className="modal-close" disabled={closeDisabled} onClick={onClose} aria-label="닫기">×</button><p className="modal-kicker">{kicker}</p><h2 id={titleId}>{title}</h2>{children}</dialog></div>;
}

function EventModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const today = getSeoulDateKey();
  return <ModalShell title="새 행사 만들기" kicker="STEP 01 · EVENT" closeDisabled={busy} onClose={onClose}><p className="modal-intro">기본 정보를 입력하면 참가자 초대 QR이 자동으로 만들어집니다.</p><form className="modal-form" aria-busy={busy} onSubmit={onSubmit}><label>행사명<input name="name" required autoFocus maxLength={100} placeholder="예: 2026 여름 공동체 주간" /></label><label>행사 설명 <small>선택</small><textarea name="description" rows={3} maxLength={1000} placeholder="참가자 화면에 보여줄 짧은 소개" /></label><div className="form-row"><label>시작일<input name="startDate" type="date" defaultValue={today} required /></label><label>종료일<input name="endDate" type="date" defaultValue={today} required /></label></div><div className="form-row"><label>기관명<input name="institution" maxLength={100} defaultValue="NCHM" /></label><label>장소<input name="location" maxLength={200} placeholder="예: 본관 1층" /></label></div><div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "행사 만드는 중…" : "행사와 초대 QR 만들기 →"}</button></div></form></ModalShell>;
}

function ClubModal({ eventName, club, busy, onClose, onSubmit }: { eventName: string; club?: Club; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const editing = Boolean(club);
  return <ModalShell title={editing ? "동아리 수정" : "동아리 스탬프 추가"} kicker={editing ? "CLUB · EDIT" : "STEP 02 · PRIMARY STAMP"} closeDisabled={busy} onClose={onClose}><p className="modal-intro"><strong>{eventName}</strong>의 동아리 정보와 QR 스캔 후 보여줄 안내를 설정합니다.</p><form className="modal-form" aria-busy={busy} onSubmit={onSubmit}><div className="form-row club-name-row"><label>동아리명<input name="name" required autoFocus maxLength={60} defaultValue={club?.name} placeholder="예: 청년 찬양팀" /></label><label>도장 모양<input name="stampEmoji" maxLength={8} defaultValue={club?.stampEmoji || "⭐"} placeholder="⭐" /></label></div><label>동아리 소개 <small>참여 전 표시</small><input name="description" maxLength={200} defaultValue={club?.description} placeholder="참가자 스탬프 화면에 보여줄 짧은 설명" /></label><label>스탬프 완료 멘트 <small>선택</small><input name="stampMessage" maxLength={120} defaultValue={club?.stampMessage} placeholder="예: 미션 성공! 선생님께 화면을 보여 주세요." /></label><label>요건·제출 안내 <small>선택</small><textarea name="submissionGuide" rows={3} maxLength={300} defaultValue={club?.submissionGuide} placeholder="예: 활동지 작성 후 본관 1층 안내 부스로 보내 주세요." /></label><fieldset disabled={busy}><legend>초대 QR 없이 바로 들어온 참가자에게 받을 정보</legend><label className="check-card"><input type="checkbox" name="collectGender" defaultChecked={club?.collectGender ?? true} /><span><i>✓</i><strong>성별</strong><small>여성 · 남성 · 응답하지 않음</small></span></label><label className="check-card"><input type="checkbox" name="collectAge" defaultChecked={club?.collectAge ?? true} /><span><i>✓</i><strong>연령 구분</strong><small>유아 · 초등 · 중등 · 고등 · 청년 · 후기</small></span></label></fieldset><div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "저장 중…" : editing ? "수정 내용 저장 →" : "동아리 스탬프 QR 만들기 →"}</button></div></form></ModalShell>;
}

function StampPointModal({ eventName, busy, onClose, onSubmit }: { eventName: string; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="추가 지점 만들기" kicker="OPTIONAL · EXTRA POINT" closeDisabled={busy} onClose={onClose}><p className="modal-intro">기본 스탬프는 동아리 QR입니다. <strong>{eventName}</strong>에 포토존 같은 별도 방문 지점이 필요할 때만 추가해 주세요.</p><form className="modal-form" aria-busy={busy} onSubmit={onSubmit}><label>추가 지점명<input name="name" required autoFocus maxLength={40} placeholder="예: 포토존" /></label><label>지점 설명 <small>선택</small><textarea name="description" rows={3} maxLength={300} placeholder="참가자 진행 화면에 보여줄 안내" /></label><div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "추가 지점 만드는 중…" : "추가 지점 QR 만들기 →"}</button></div></form></ModalShell>;
}

function EventDeletionModal({ action, busy, error, onClose, onMoveToTrash, onPermanentDelete }: {
  action: EventDeletionAction;
  busy: boolean;
  error: string;
  onClose: () => void;
  onMoveToTrash: () => void;
  onPermanentDelete: (confirmationName: string) => void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const permanent = action.kind === "permanent";
  const validConfirmation = confirmationName === action.event.name;
  const impactItems = [
    ["동아리", action.impact.clubCount],
    ["참가자", action.impact.participantCount],
    ["응답", action.impact.responseCount],
    ["추가 지점", action.impact.stampPointCount],
    ["동아리 스탬프 기록", action.impact.clubStampRecordCount],
    ["추가 스탬프 기록", action.impact.stampRecordCount],
  ] as const;

  return (
    <ModalShell
      title={permanent ? "행사를 영구 삭제할까요?" : "행사를 휴지통으로 이동할까요?"}
      kicker={permanent ? "DANGER ZONE · PERMANENT" : "SAFE DELETE · TRASH"}
      closeDisabled={busy}
      onClose={onClose}
    >
      <div className={`deletion-warning ${permanent ? "permanent" : ""}`}>
        <span aria-hidden="true">!</span>
        <div>
          <strong>“{action.event.name}”</strong>
          <p>{permanent ? "아래 데이터가 모두 삭제되며 되돌릴 수 없습니다." : "일반 목록과 참가자 QR에서 즉시 숨겨집니다. 휴지통에서는 복구할 수 있습니다."}</p>
        </div>
      </div>
      <div className="deletion-impact" aria-label="영향을 받는 데이터">
        {impactItems.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString()}</strong></div>)}
      </div>
      {error && <div className="deletion-inline-error" role="alert"><span>!</span>{error}</div>}
      {permanent && (
        <label className="confirmation-field">
          확인을 위해 행사명 <strong>{action.event.name}</strong>을(를) 입력하세요.
          <input autoFocus autoComplete="off" value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} aria-describedby="permanent-delete-note" />
          <small id="permanent-delete-note">영구 삭제 후에는 QR, 참가자, 응답 및 스탬프 기록을 복구할 수 없습니다.</small>
        </label>
      )}
      <div className="modal-actions deletion-actions">
        <button type="button" autoFocus={!permanent} disabled={busy} onClick={onClose}>취소</button>
        <button
          type="button"
          className={`button ${permanent ? "button-danger" : "button-primary"}`}
          disabled={busy || (permanent && !validConfirmation)}
          onClick={() => permanent ? onPermanentDelete(confirmationName) : onMoveToTrash()}
        >
          {busy ? "처리 중…" : permanent ? "영구 삭제" : "휴지통으로 이동"}
        </button>
      </div>
    </ModalShell>
  );
}

function QrModal({ qr, data, busy, onClose, onNotify }: { qr: ShareQr; data: string; busy: boolean; onClose: () => void; onNotify: (message: string) => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(qr.link);
      onNotify("링크를 복사했습니다.");
    } catch {
      onNotify("링크를 복사하지 못했습니다. 주소를 길게 눌러 직접 복사해 주세요.");
    }
  }
  function printQr() {
    try {
      const printWindow = window.open("", "_blank", "width=760,height=900");
      if (!printWindow) return onNotify("팝업을 허용한 뒤 다시 인쇄해 주세요.");
      printWindow.document.write(`<title>${escapeHtml(qr.title)} QR</title><style>body{font-family:system-ui;text-align:center;padding:40px;color:#123d37}img{width:min(80vw,560px)}h1{margin-bottom:8px}p{color:#667}</style><h1>${escapeHtml(qr.title)}</h1><p>${escapeHtml(qr.label)}</p><img src="${data}" onload="window.print()" alt="QR">`);
      printWindow.document.close();
    } catch {
      onNotify("인쇄 창을 열지 못했습니다. QR 이미지를 저장해 인쇄해 주세요.");
    }
  }
  return <ModalShell title={qr.title} kicker={qr.kicker} closeDisabled={busy} onClose={onClose}><p className="modal-intro">{qr.intro}</p><div className="qr-box">{busy ? <div className="qr-generating" role="status"><i />QR 이미지 만드는 중…</div> : data && <img src={data} alt={`${qr.title} QR 코드`} />}<span>{qr.label}</span></div><div className="link-box"><span>{qr.link}</span><button disabled={busy} onClick={() => void copy()}>복사</button></div><div className="qr-actions"><button className="qr-print-button" disabled={busy || !data} onClick={printQr}>QR 인쇄</button><a href={qr.link} target="_blank" rel="noreferrer">화면 보기 ↗</a>{data ? <a className="button button-primary" href={data} download={qr.filename}>QR 이미지 저장 ↓</a> : <button className="button button-primary" disabled>QR 준비 중…</button>}</div></ModalShell>;
}

async function readApiResponse<T = Record<string, unknown>>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.status === 204) return {} as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(typeof data.error === "string" && data.error.trim() ? data.error : fallbackMessage);
  }
  return data as T;
}

function friendlyError(caught: unknown, fallbackMessage: string) {
  if (caught instanceof Error && /[가-힣]/.test(caught.message)) return caught.message;
  return fallbackMessage;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatPeriod(event: EventItem) {
  const { startDate, endDate } = resolveEventRange(event);
  if (startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function formatCompactPeriod(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });
  const start = formatter.format(new Date(`${startDate}T00:00:00`));
  if (startDate === endDate) return start;
  return `${start} – ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
}

function formatSummaryActivity(value?: string | null) {
  if (!value) return "기록 없음";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function formatDateTime(value: string) {
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}
