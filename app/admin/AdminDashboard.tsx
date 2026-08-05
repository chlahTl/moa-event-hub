"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type Club = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  collectGender: boolean;
  collectAge: boolean;
  responseCount: number;
};

type EventItem = {
  id: string;
  name: string;
  institution: string;
  eventDate: string;
  location: string;
  responseCount: number;
  clubs: Club[];
};

type StatItem = { label: string; total: number };
type RecentItem = { id: string; clubName: string; participantName: string; gender: string | null; ageGroup: string | null; createdAt: string };
type Stats = { gender: StatItem[]; age: StatItem[]; recent: RecentItem[] };

const EMPTY_STATS: Stats = { gender: [], age: [], recent: [] };

export default function AdminDashboard() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"event" | "club" | "qr" | null>(null);
  const [qrClub, setQrClub] = useState<Club | null>(null);
  const [qrData, setQrData] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  async function loadEvents(preferredId?: string) {
    setLoading(true);
    const response = await fetch("/api/events", { cache: "no-store" });
    const data = (await response.json()) as { events?: EventItem[]; error?: string };
    if (!response.ok) throw new Error(data.error || "행사를 불러오지 못했습니다.");
    setEvents(data.events ?? []);
    setSelectedId((current) => preferredId || current || data.events?.[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    loadEvents().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "오류가 발생했습니다.");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected?.id) {
      setStats(EMPTY_STATS);
      return;
    }
    fetch(`/api/stats?eventId=${encodeURIComponent(selected.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStats(data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "통계를 불러오지 못했습니다."));
  }, [selected?.id, selected?.responseCount]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setModal(null);
    await loadEvents(data.event.id);
    notify("새 행사를 만들었습니다.");
  }

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: selected.id,
        name: form.get("name"),
        description: form.get("description"),
        collectGender: form.get("collectGender") === "on",
        collectAge: form.get("collectAge") === "on",
      }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setModal(null);
    await loadEvents(selected.id);
    notify("동아리와 전용 QR을 만들었습니다.");
  }

  async function openQr(club: Club) {
    const url = `${window.location.origin}/visit/${club.id}`;
    setQrClub(club);
    setQrData(await QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: "#123d37", light: "#ffffff" } }));
    setModal("qr");
  }

  const totalClubs = events.reduce((sum, event) => sum + event.clubs.length, 0);
  const totalResponses = events.reduce((sum, event) => sum + event.responseCount, 0);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="brand-lockup brand-admin"><span className="brand-mark">ㅁ</span><span>모아</span></Link>
        <p className="workspace-label">NCHM 연계 운영</p>
        <nav className="side-nav" aria-label="관리자 메뉴">
          <a href="#overview" className="active"><span>⌂</span>대시보드</a>
          <a href="#clubs"><span>◫</span>행사 · 동아리</a>
          <a href="#responses"><span>≡</span>응답 내역</a>
          <a href="#integration"><span>↔</span>연동 안내</a>
        </nav>
        <div className="sidebar-help">
          <span className="status-dot" /> 독립 운영 중
          <p>NCHM Visite와 연결하지 않아도 바로 사용할 수 있습니다.</p>
        </div>
        <Link href="/" className="back-link">← 소개 화면으로</Link>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="breadcrumb">관리자 / 대시보드</p>
            <h1>좋은 아침입니다.</h1>
          </div>
          <div className="topbar-actions">
            {events.length > 0 && (
              <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label="행사 선택">
                {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            )}
            <button className="button button-primary small" onClick={() => { setError(""); setModal("event"); }}>＋ 새 행사</button>
            <div className="avatar">관</div>
          </div>
        </header>

        {error && <div className="error-banner" role="alert"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        <div className="admin-content" id="overview">
          {loading ? (
            <div className="loading-card"><span /> 데이터를 정리하고 있습니다.</div>
          ) : !selected ? (
            <EmptyState onCreate={() => setModal("event")} />
          ) : (
            <>
              <div className="event-spotlight">
                <div>
                  <p className="eyebrow light"><span /> SELECTED EVENT</p>
                  <h2>{selected.name}</h2>
                  <p>{formatDate(selected.eventDate)} · {selected.location || "장소 미정"} · {selected.institution}</p>
                </div>
                <div className="spotlight-number"><strong>{selected.responseCount}</strong><span>현재 참여</span></div>
                <div className="spotlight-actions">
                  <button onClick={() => setModal("club")}>동아리 추가 <span>＋</span></button>
                  <a href={`/api/export?eventId=${selected.id}`}>엑셀용 CSV <span>↓</span></a>
                </div>
              </div>

              <div className="metric-grid">
                <Metric label="전체 행사" value={events.length} note="누적 생성" symbol="◇" />
                <Metric label="등록 동아리" value={totalClubs} note={`${selected.clubs.length}개 현재 행사`} symbol="◫" />
                <Metric label="누적 응답" value={totalResponses} note="실시간 자동 저장" symbol="↗" />
                <Metric label="입력 항목" value={3} note="이름 · 성별 · 연령" symbol="✓" />
              </div>

              <section className="dashboard-section" id="clubs">
                <div className="dashboard-heading">
                  <div><p>동아리 관리</p><h2>동아리별 입력 링크</h2></div>
                  <button className="subtle-button" onClick={() => setModal("club")}>＋ 동아리 추가</button>
                </div>
                {selected.clubs.length ? (
                  <div className="club-grid">
                    {selected.clubs.map((club, index) => (
                      <article className="club-card" key={club.id}>
                        <div className="club-card-top"><span>{String(index + 1).padStart(2, "0")}</span><button onClick={() => openQr(club)} aria-label={`${club.name} QR 보기`}>⌗</button></div>
                        <h3>{club.name}</h3>
                        <p>{club.description || "동아리 전용 참여 입력"}</p>
                        <div className="field-tags">
                          <span>이름</span>
                          {club.collectGender && <span>성별</span>}
                          {club.collectAge && <span>연령 구분</span>}
                        </div>
                        <div className="club-card-footer"><strong>{club.responseCount}<small>명</small></strong><button onClick={() => openQr(club)}>QR · 링크 보기 →</button></div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <button className="empty-clubs" onClick={() => setModal("club")}><span>＋</span><strong>첫 동아리 추가</strong><small>받을 항목을 고르면 QR이 바로 만들어집니다.</small></button>
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
                <div className="panel-heading"><div><p>최근 활동</p><h2>최근 응답</h2></div><a href={`/api/export?eventId=${selected.id}`}>전체 내려받기 ↓</a></div>
                <RecentTable items={stats.recent} />
              </section>

              <section className="integration-card" id="integration">
                <div className="integration-icon">↔</div>
                <div><span>연동 준비</span><h2>NCHM Visite는 나중에 연결할 수 있습니다.</h2><p>현재는 독립적으로 안전하게 운영하고, 추후 Visite가 제공하는 API 또는 정기 CSV 가져오기 방식에 맞춰 연결합니다.</p></div>
                <div className="integration-route"><small>현재 권장 흐름</small><strong>모아 저장소</strong><i>→</i><strong>CSV / REST API</strong><i>→</i><strong>NCHM Visite</strong></div>
              </section>
            </>
          )}
        </div>
      </section>

      {modal === "event" && <EventModal onClose={() => setModal(null)} onSubmit={createEvent} />}
      {modal === "club" && selected && <ClubModal eventName={selected.name} onClose={() => setModal(null)} onSubmit={createClub} />}
      {modal === "qr" && qrClub && <QrModal club={qrClub} data={qrData} onClose={() => setModal(null)} onNotify={notify} />}
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
      <p>행사를 만든 다음 그 안에 동아리를 추가하면, 동아리마다 전용 QR이 자동으로 생깁니다.</p>
      <button className="button button-primary" onClick={onCreate}>새 행사 만들기 →</button>
    </section>
  );
}

function Metric({ label, value, note, symbol }: { label: string; value: number; note: string; symbol: string }) {
  return <article className="metric-card"><div className="metric-icon">{symbol}</div><p>{label}</p><strong>{value.toLocaleString()}<small>{label.includes("응답") ? "명" : ""}</small></strong><span>{note}</span></article>;
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

function ModalShell({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="닫기">×</button><p className="modal-kicker">{kicker}</p><h2>{title}</h2>{children}</section></div>;
}

function EventModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return <ModalShell title="새 행사 만들기" kicker="STEP 01 · EVENT" onClose={onClose}><p className="modal-intro">큰 분류가 될 행사의 기본 정보를 입력해 주세요.</p><form className="modal-form" onSubmit={onSubmit}><label>행사명<input name="name" required autoFocus placeholder="예: 2026 여름 공동체 주간" /></label><div className="form-row"><label>기관명<input name="institution" defaultValue="NCHM" /></label><label>행사 날짜<input name="eventDate" type="date" defaultValue={today} required /></label></div><label>장소<input name="location" placeholder="예: 본관 1층 대강당" /></label><div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button className="button button-primary" type="submit">행사 만들기 →</button></div></form></ModalShell>;
}

function ClubModal({ eventName, onClose, onSubmit }: { eventName: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="동아리 추가" kicker="STEP 02 · CLUB" onClose={onClose}><p className="modal-intro"><strong>{eventName}</strong> 안에 소분류와 전용 QR을 만듭니다. 이름은 모든 동아리에서 기본으로 받습니다.</p><form className="modal-form" onSubmit={onSubmit}><label>동아리명<input name="name" required autoFocus placeholder="예: 청년 찬양팀" /></label><label>안내 문구 <small>선택</small><input name="description" placeholder="입력 화면에 함께 보여줄 짧은 설명" /></label><fieldset><legend>추가로 받을 정보</legend><label className="check-card"><input type="checkbox" name="collectGender" defaultChecked /><span><i>✓</i><strong>성별</strong><small>여성 · 남성 · 응답하지 않음</small></span></label><label className="check-card"><input type="checkbox" name="collectAge" defaultChecked /><span><i>✓</i><strong>연령 구분</strong><small>유아 · 초등 · 중등 · 고등 · 청년 · 후기</small></span></label></fieldset><div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button className="button button-primary" type="submit">동아리와 QR 만들기 →</button></div></form></ModalShell>;
}

function QrModal({ club, data, onClose, onNotify }: { club: Club; data: string; onClose: () => void; onNotify: (message: string) => void }) {
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/visit/${club.id}`;
  async function copy() { await navigator.clipboard.writeText(link); onNotify("입력 링크를 복사했습니다."); }
  return <ModalShell title={club.name} kicker="CLUB QR · READY" onClose={onClose}><p className="modal-intro">이 QR은 이 동아리의 입력 항목으로 바로 연결됩니다.</p><div className="qr-box">{data && <img src={data} alt={`${club.name} 참여 입력 QR 코드`} />}<span>이름{club.collectGender && " · 성별"}{club.collectAge && " · 연령 구분"}</span></div><div className="link-box"><span>{link}</span><button onClick={copy}>복사</button></div><div className="qr-actions"><a href={link} target="_blank" rel="noreferrer">입력 화면 보기 ↗</a><a className="button button-primary" href={data} download={`${club.name}-QR.png`}>QR 이미지 저장 ↓</a></div></ModalShell>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}
