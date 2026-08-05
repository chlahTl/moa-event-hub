"use client";

import { FormEvent, useEffect, useState } from "react";
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
  eventDate: string;
  startDate: string;
  endDate: string;
  inviteToken: string;
  location: string;
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

const EMPTY_STATS: Stats = { gender: [], age: [], recent: [] };

export default function AdminDashboard() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"event" | "club" | "stampPoint" | "qr" | null>(null);
  const [shareQr, setShareQr] = useState<ShareQr | null>(null);
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
    await loadEvents(data.event.id);
    notify("새 행사를 만들었습니다.");
    await openShareQr({
      title: data.event.name,
      kicker: "EVENT INVITE QR · READY",
      intro: "참가자가 처음 스캔해 행사 정보와 이름을 등록하는 초대 QR입니다.",
      label: "행사 참가 등록",
      link: `${window.location.origin}/join/${data.event.inviteToken}`,
      filename: `${data.event.name}-초대-QR.png`,
    });
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

  async function createStampPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/stamp-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selected.id, name: form.get("name"), description: form.get("description") }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    await loadEvents(selected.id);
    notify("스탬프 지점과 전용 QR을 만들었습니다.");
    await openStampQr(data.point);
  }

  async function openShareQr(qr: ShareQr) {
    setShareQr(qr);
    setQrData(await QRCode.toDataURL(qr.link, { width: 720, margin: 2, color: { dark: "#123d37", light: "#ffffff" } }));
    setModal("qr");
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

  const totalClubs = events.reduce((sum, event) => sum + event.clubs.length, 0);
  const totalParticipants = events.reduce((sum, event) => sum + event.participantCount, 0);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" target="_top" className="brand-lockup brand-admin"><span className="brand-mark">ㅁ</span><span>모아</span></a>
        <p className="workspace-label">NCHM 연계 운영</p>
        <nav className="side-nav" aria-label="관리자 메뉴">
          <a href="#overview" className="active"><span>⌂</span>대시보드</a>
          <a href="#overview"><span>◇</span>행사 관리</a>
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
                  <p>{formatPeriod(selected.startDate, selected.endDate)} · {selected.location || "장소 미정"} · {selected.institution}</p>
                  {selected.description && <p className="spotlight-description">{selected.description}</p>}
                </div>
                <div className="spotlight-number"><strong>{selected.participantCount}</strong><span>행사 참가자</span></div>
                <div className="spotlight-actions">
                  <button onClick={() => setModal("club")}>동아리 추가 <span>＋</span></button>
                  <button className="secondary-spotlight" onClick={() => openEventQr(selected)}>초대 QR <span>⌗</span></button>
                  <a href="#stamps">추가 지점 관리 <span>＋</span></a>
                </div>
              </div>

              <div className="metric-grid">
                <Metric label="전체 행사" value={events.length} note="누적 생성" symbol="◇" />
                <Metric label="등록 동아리" value={totalClubs} note={`${selected.clubs.length}개 현재 행사`} symbol="◫" />
                <Metric label="행사 참가자" value={totalParticipants} note={`${selected.participantCount}명 현재 행사`} symbol="↗" />
                <Metric label="기본 스탬프" value={selected.clubs.length} note="동아리 QR 기준" symbol="✓" />
              </div>

              <section className="dashboard-section" id="clubs">
                <div className="dashboard-heading">
                  <div><p>기본 스탬프 · 동아리 QR</p><h2>동아리 참여 스탬프</h2></div>
                  <button className="subtle-button" onClick={() => setModal("club")}>＋ 동아리 추가</button>
                </div>
                {selected.clubs.length ? (
                  <div className="club-grid">
                    {selected.clubs.map((club, index) => (
                      <article className="club-card" key={club.id}>
                        <div className="club-card-top"><span>{String(index + 1).padStart(2, "0")}</span><button onClick={() => openClubQr(club)} aria-label={`${club.name} QR 보기`}>⌗</button></div>
                        <h3>{club.name}</h3>
                        <p>{club.description || "동아리 전용 참여 입력"}</p>
                        <div className="field-tags">
                          <span>이름</span>
                          {club.collectGender && <span>성별</span>}
                          {club.collectAge && <span>연령 구분</span>}
                        </div>
                        <div className="club-card-footer"><strong>{club.responseCount}<small>명</small></strong><button onClick={() => openClubQr(club)}>기본 스탬프 QR →</button></div>
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
                    <button className="subtle-button" onClick={() => openEventQr(selected)}>초대 QR 보기</button>
                    <button className="subtle-button" onClick={() => setModal("stampPoint")}>＋ 추가 지점</button>
                  </div>
                </div>
                {selected.stampPoints.length ? (
                  <div className="stamp-admin-grid">
                    {selected.stampPoints.map((point, index) => (
                      <article className="stamp-admin-card" key={point.id}>
                        <div className="stamp-admin-number">{String(index + 1).padStart(2, "0")}</div>
                        <div><h3>{point.name}</h3><p>{point.description || "현장에서 QR을 스캔해 방문을 인증합니다."}</p></div>
                        <span className={point.active ? "active" : "inactive"}>{point.active ? "운영 중" : "비활성"}</span>
                        <button onClick={() => openStampQr(point)}>QR 보기 · 저장 →</button>
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
      {modal === "stampPoint" && selected && <StampPointModal eventName={selected.name} onClose={() => setModal(null)} onSubmit={createStampPoint} />}
      {modal === "qr" && shareQr && <QrModal qr={shareQr} data={qrData} onClose={() => setModal(null)} onNotify={notify} />}
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

function Metric({ label, value, note, symbol }: { label: string; value: number; note: string; symbol: string }) {
  return <article className="metric-card"><div className="metric-icon">{symbol}</div><p>{label}</p><strong>{value.toLocaleString()}<small>{label.includes("응답") || label.includes("참가자") ? "명" : ""}</small></strong><span>{note}</span></article>;
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
  return <ModalShell title="새 행사 만들기" kicker="STEP 01 · EVENT" onClose={onClose}><p className="modal-intro">기본 정보를 입력하면 참가자 초대 QR이 자동으로 만들어집니다.</p><form className="modal-form" onSubmit={onSubmit}><label>행사명<input name="name" required autoFocus placeholder="예: 2026 여름 공동체 주간" /></label><label>행사 설명 <small>선택</small><textarea name="description" rows={3} placeholder="참가자 화면에 보여줄 짧은 소개" /></label><div className="form-row"><label>시작일<input name="startDate" type="date" defaultValue={today} required /></label><label>종료일<input name="endDate" type="date" defaultValue={today} required /></label></div><div className="form-row"><label>기관명<input name="institution" defaultValue="NCHM" /></label><label>장소<input name="location" placeholder="예: 본관 1층" /></label></div><div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button className="button button-primary" type="submit">행사와 초대 QR 만들기 →</button></div></form></ModalShell>;
}

function ClubModal({ eventName, onClose, onSubmit }: { eventName: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="동아리 스탬프 추가" kicker="STEP 02 · PRIMARY STAMP" onClose={onClose}><p className="modal-intro"><strong>{eventName}</strong>의 기본 스탬프가 될 동아리와 QR을 만듭니다. 행사 참가자는 이 QR을 스캔하면 이름을 다시 입력하지 않습니다.</p><form className="modal-form" onSubmit={onSubmit}><label>동아리명<input name="name" required autoFocus placeholder="예: 청년 찬양팀" /></label><label>안내 문구 <small>선택</small><input name="description" placeholder="참가자 스탬프 화면에 보여줄 짧은 설명" /></label><fieldset><legend>초대 QR 없이 바로 들어온 참가자에게 받을 정보</legend><label className="check-card"><input type="checkbox" name="collectGender" defaultChecked /><span><i>✓</i><strong>성별</strong><small>여성 · 남성 · 응답하지 않음</small></span></label><label className="check-card"><input type="checkbox" name="collectAge" defaultChecked /><span><i>✓</i><strong>연령 구분</strong><small>유아 · 초등 · 중등 · 고등 · 청년 · 후기</small></span></label></fieldset><div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button className="button button-primary" type="submit">동아리 스탬프 QR 만들기 →</button></div></form></ModalShell>;
}

function StampPointModal({ eventName, onClose, onSubmit }: { eventName: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="추가 지점 만들기" kicker="OPTIONAL · EXTRA POINT" onClose={onClose}><p className="modal-intro">기본 스탬프는 동아리 QR입니다. <strong>{eventName}</strong>에 포토존 같은 별도 방문 지점이 필요할 때만 추가해 주세요.</p><form className="modal-form" onSubmit={onSubmit}><label>추가 지점명<input name="name" required autoFocus maxLength={40} placeholder="예: 포토존" /></label><label>지점 설명 <small>선택</small><textarea name="description" rows={3} placeholder="참가자 진행 화면에 보여줄 안내" /></label><div className="modal-actions"><button type="button" onClick={onClose}>취소</button><button className="button button-primary" type="submit">추가 지점 QR 만들기 →</button></div></form></ModalShell>;
}

function QrModal({ qr, data, onClose, onNotify }: { qr: ShareQr; data: string; onClose: () => void; onNotify: (message: string) => void }) {
  async function copy() { await navigator.clipboard.writeText(qr.link); onNotify("링크를 복사했습니다."); }
  function printQr() {
    const printWindow = window.open("", "_blank", "width=760,height=900");
    if (!printWindow) return onNotify("팝업을 허용한 뒤 다시 인쇄해 주세요.");
    printWindow.document.write(`<title>${escapeHtml(qr.title)} QR</title><style>body{font-family:system-ui;text-align:center;padding:40px;color:#123d37}img{width:min(80vw,560px)}h1{margin-bottom:8px}p{color:#667}</style><h1>${escapeHtml(qr.title)}</h1><p>${escapeHtml(qr.label)}</p><img src="${data}" onload="window.print()" alt="QR">`);
    printWindow.document.close();
  }
  return <ModalShell title={qr.title} kicker={qr.kicker} onClose={onClose}><p className="modal-intro">{qr.intro}</p><div className="qr-box">{data && <img src={data} alt={`${qr.title} QR 코드`} />}<span>{qr.label}</span></div><div className="link-box"><span>{qr.link}</span><button onClick={copy}>복사</button></div><div className="qr-actions"><button className="qr-print-button" onClick={printQr}>QR 인쇄</button><a href={qr.link} target="_blank" rel="noreferrer">화면 보기 ↗</a><a className="button button-primary" href={data} download={qr.filename}>QR 이미지 저장 ↓</a></div></ModalShell>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatPeriod(startDate: string, endDate: string) {
  if (startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function formatDateTime(value: string) {
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value.replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}
