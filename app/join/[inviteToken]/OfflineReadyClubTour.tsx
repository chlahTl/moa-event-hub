"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGE_GROUP_OPTIONS } from "../../../lib/tour";

type Point = { id: string; name: string; description: string; visited: boolean; visitedAt: string | null };
type ClubPoint = Omit<Point, "id"> & { stampEmoji: string; stampMessage: string; submissionGuide: string };
type ClaimTarget = { pointToken?: string; clubId?: string };
type TourData = {
  event: {
    id: string;
    name: string;
    description: string;
    institution: string;
    location: string;
    startDate: string;
    endDate: string;
    inviteToken: string;
  };
  participant: { id: string; name: string; gender: string | null; ageGroup: string | null } | null;
  clubs: ClubPoint[];
  extraPoints: Point[];
  progress: { completed: number; total: number; percent: number };
  extraProgress: { completed: number; total: number; percent: number };
  successMessage: string;
};

const GENDERS = ["남성", "여성"];

export default function EventTour({ inviteToken }: { inviteToken: string }) {
  const [tour, setTour] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanLocked = useRef(false);
  const scannerSession = useRef(0);
  const pendingKey = `moa-pending-stamps:${inviteToken}`;

  const loadTour = useCallback(async () => {
    const response = await fetch(`/api/tour/${encodeURIComponent(inviteToken)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "행사를 불러오지 못했습니다.");
    setTour(data);
  }, [inviteToken]);

  useEffect(() => {
    loadTour()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "행사를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [loadTour]);

  const readPending = useCallback((): ClaimTarget[] => {
    try {
      const parsed = JSON.parse(localStorage.getItem(pendingKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && (item.clubId || item.pointToken)) : [];
    } catch {
      return [];
    }
  }, [pendingKey]);

  const writePending = useCallback((items: ClaimTarget[]) => {
    localStorage.setItem(pendingKey, JSON.stringify(items));
    setPendingCount(items.length);
  }, [pendingKey]);

  const queuePending = useCallback((target: ClaimTarget) => {
    const items = readPending();
    const identity = JSON.stringify(target);
    if (!items.some((item) => JSON.stringify(item) === identity)) items.push(target);
    writePending(items);
  }, [readPending, writePending]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPendingCount(readPending().length);
    let flushing = false;
    async function flushPending() {
      if (flushing || !navigator.onLine) return;
      flushing = true;
      const remaining: ClaimTarget[] = [];
      for (const target of readPending()) {
        try {
          const response = await fetch("/api/stamps/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          });
          setOnline(true);
          const data = await response.json();
          if (response.ok) setTour(data);
          else if (response.status >= 500) remaining.push(target);
          else setError(data.error || "보관된 스탬프 QR을 확인하지 못했습니다.");
        } catch {
          remaining.push(target);
          setOnline(false);
        }
      }
      writePending(remaining);
      flushing = false;
    }
    const handleOnline = () => { setOnline(true); void flushPending(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const retryTimer = window.setInterval(() => void flushPending(), 15000);
    void flushPending();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(retryTimer);
    };
  }, [readPending, writePending]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      for (const track of (videoRef.current.srcObject as MediaStream).getTracks()) track.stop();
      videoRef.current.srcObject = null;
    }
  }, []);

  const closeScanner = useCallback(() => {
    scannerSession.current += 1;
    stopScanner();
    setScannerOpen(false);
    setScannerStatus("");
    scanLocked.current = false;
  }, [stopScanner]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  async function claimStamp(target: ClaimTarget) {
    setClaiming(true);
    setError("");
    try {
      const response = await fetch("/api/stamps/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "스탬프를 등록하지 못했습니다.");
      setTour(data);
      closeScanner();
    } catch (caught) {
      if (!navigator.onLine || caught instanceof TypeError) {
        queuePending(target);
        setOnline(false);
        setError("연결이 끊겨 QR을 안전하게 보관했어요. 인터넷이 돌아오면 자동 등록합니다.");
        closeScanner();
        return;
      }
      throw caught;
    } finally {
      setClaiming(false);
    }
  }

  async function handleScannedText(text: string) {
    try {
      const url = new URL(text, window.location.origin);
      const clubMatch = url.pathname.match(/^\/visit\/([^/]+)\/?$/);
      const pointMatch = url.pathname.match(/^\/stamp\/([^/]+)\/?$/);
      if (!clubMatch && !pointMatch) throw new Error("이 행사의 부스·동아리 또는 추가 지점 QR을 스캔해 주세요.");
      setScannerStatus("스탬프를 확인하고 있어요…");
      await claimStamp(clubMatch
        ? { clubId: decodeURIComponent(clubMatch[1]) }
        : { pointToken: decodeURIComponent(pointMatch![1]) });
    } catch (caught) {
      setClaiming(false);
      scanLocked.current = false;
      setScannerStatus(caught instanceof Error ? caught.message : "QR을 확인하지 못했습니다.");
    }
  }

  async function startScanner() {
    const session = ++scannerSession.current;
    setScannerOpen(true);
    setScannerStatus("카메라에 연결하고 있어요…");
    scanLocked.current = false;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저에서는 카메라 스캔을 지원하지 않습니다.");
      }
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      if (!videoRef.current) throw new Error("카메라 화면을 열지 못했습니다.");
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || scanLocked.current) return;
          scanLocked.current = true;
          controlsRef.current?.stop();
          void handleScannedText(result.getText());
        },
      );
      if (session !== scannerSession.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setScannerStatus("사각형 안에 지점 QR을 맞춰 주세요.");
    } catch (caught) {
      if (session !== scannerSession.current) return;
      const name = caught instanceof DOMException ? caught.name : "";
      setScannerStatus(
        name === "NotAllowedError"
          ? "카메라 권한이 거부됐어요. 브라우저 설정에서 카메라를 허용해 주세요."
          : caught instanceof Error
            ? caught.message
            : "카메라를 시작하지 못했습니다.",
      );
      stopScanner();
    }
  }

  if (loading) return <TourCenter message="행사 참여 화면을 불러오고 있어요." />;
  if (error && !tour) return <TourCenter error message={error} onRetry={() => window.location.reload()} />;
  if (!tour) return null;
  if (!tour.participant) {
    return <JoinForm inviteToken={inviteToken} event={tour.event} onJoined={setTour} />;
  }

  const remaining = tour.clubs.filter((club) => !club.visited);
  return (
    <main className="tour-shell">
      <header className="tour-header">
        <div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div>
        <span>{tour.event.institution}</span>
      </header>
      <section className="tour-hero">
        <div>
          <p className="tour-kicker">STAMP TOUR · {tour.participant.name} 님</p>
          <h1>{tour.event.name}</h1>
          <p>{tour.event.description || "부스·동아리 QR을 스캔하며 참여 스탬프를 모아 보세요."}</p>
        </div>
        <button className="scan-button" onClick={startScanner}><span>⌗</span> 부스 QR 스캔</button>
      </section>

      {tour.successMessage && <div className="stamp-success" role="status"><span>✓</span>{tour.successMessage}</div>}
      {(!online || pendingCount > 0) && <div className="offline-banner" role="status"><span>↻</span><div><strong>{online ? "보관된 스탬프를 등록하고 있어요." : "현재 오프라인입니다."}</strong><p>{pendingCount ? `${pendingCount}개 QR을 보관 중이며 연결 복구 후 자동 등록됩니다.` : "화면은 계속 사용할 수 있고, 스캔한 QR은 연결 복구 후 등록됩니다."}</p></div></div>}
      {error && <div className="tour-error" role="alert">{error}</div>}

      <section className="tour-progress-card">
        <div className="tour-count"><strong>{tour.progress.completed}</strong><span>/ {tour.progress.total}</span></div>
        <div className="tour-progress-copy">
          <div><strong>{tour.progress.total}개 동아리 중 {tour.progress.completed}개 참여</strong><span>{tour.progress.percent}%</span></div>
          <div className="tour-progress-track"><i style={{ width: `${tour.progress.percent}%` }} /></div>
          <p>{remaining.length ? `앞으로 ${remaining.length}개 부스·동아리가 남았어요.` : tour.clubs.length ? "모든 부스·동아리에 참여했어요!" : "이 행사에 등록된 부스·동아리가 없습니다."}</p>
        </div>
      </section>

      <section className="tour-points">
        <div className="tour-section-heading"><div><p>PARTICIPATION STAMPS</p><h2>부스·동아리 참여 현황</h2></div><button onClick={startScanner}>QR 스캔</button></div>
        {tour.clubs.length ? (
          <div className="tour-point-grid">
            {tour.clubs.map((club, index) => (
              <article className={club.visited ? "tour-point visited" : "tour-point"} key={`${club.name}-${index}`}>
                <div className="stamp-medal">{club.visited ? club.stampEmoji || "⭐" : String(index + 1).padStart(2, "0")}</div>
                <div><span>{club.visited ? "참여 완료" : "아직 참여 전"}</span><h3>{club.name}</h3><p>{club.visited && club.submissionGuide ? club.submissionGuide : club.description || "현장의 참여 QR을 스캔해 주세요."}</p></div>
              </article>
            ))}
          </div>
        ) : <div className="tour-empty">이 행사에 등록된 부스·동아리가 없습니다.</div>}
      </section>

      {tour.extraPoints.length > 0 && (
        <section className="tour-points tour-extra-points">
          <div className="tour-section-heading"><div><p>OPTIONAL STAMPS</p><h2>추가 지점 스탬프</h2></div><span>{tour.extraProgress.total}곳 중 {tour.extraProgress.completed}곳</span></div>
          <div className="tour-point-grid">
            {tour.extraPoints.map((point, index) => (
              <article className={point.visited ? "tour-point visited" : "tour-point"} key={point.id}>
                <div className="stamp-medal">{point.visited ? "✓" : `＋${index + 1}`}</div>
                <div><span>{point.visited ? "방문 완료" : "선택 방문"}</span><h3>{point.name}</h3><p>{point.description || "추가 지점 QR을 찾아 주세요."}</p></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {scannerOpen && (
        <div className="scanner-backdrop" role="dialog" aria-modal="true" aria-label="QR 스캐너">
          <section className="scanner-panel">
            <button className="scanner-close" onClick={closeScanner} aria-label="스캐너 닫기">×</button>
            <p className="tour-kicker">POINT QR SCAN</p>
            <h2>부스·동아리 QR을 비춰 주세요.</h2>
            <div className="scanner-frame"><video ref={videoRef} muted playsInline /><i /><i /><i /><i /></div>
            <p className={scannerStatus.includes("거부") || scannerStatus.includes("이 행사의") ? "scanner-message error" : "scanner-message"}>{claiming ? "스탬프를 등록하고 있어요…" : scannerStatus}</p>
            {(scannerStatus.includes("거부") || scannerStatus.includes("지원하지")) && <button className="scanner-retry" onClick={() => void startScanner()}>카메라 다시 시도</button>}
            <small>부스·동아리 QR과 추가 지점 QR을 같은 화면에서 인식할 수 있어요.</small>
          </section>
        </div>
      )}
    </main>
  );
}

function JoinForm({ inviteToken, event, onJoined }: { inviteToken: string; event: TourData["event"]; onJoined: (tour: TourData) => void }) {
  const [participantName, setParticipantName] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => Boolean(participantName.trim()), [participantName]);

  async function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/tour/${encodeURIComponent(inviteToken)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantName, gender, ageGroup }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "참가 등록을 완료하지 못했습니다.");
      onJoined(data);
    } catch (caught) {
      setError(caught instanceof TypeError
        ? "현재 서버에 연결할 수 없어요. 입력 내용은 화면에 그대로 있으니 잠시 후 다시 눌러 주세요."
        : caught instanceof Error ? caught.message : "참가 등록을 완료하지 못했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <main className="visit-shell tour-join-shell">
      <header className="visit-header"><div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div><span>{event.institution}</span></header>
      <section className="visit-content">
        <div className="visit-event-line"><span>초대 QR 확인</span><i /><span>{formatPeriod(event.startDate, event.endDate)}</span></div>
        <h1>{event.name}</h1>
        <p className="visit-description">{event.description || "최초 한 번만 정보를 입력하면 스탬프 투어를 시작할 수 있어요."}</p>
        <div className="privacy-note"><span>✓</span><p><strong>한 번만 입력하면 돼요.</strong><br />이후 지점 QR에서는 이름을 다시 묻지 않습니다.</p></div>
        <form className="visit-form" onSubmit={submit}>
          <fieldset><legend><span>01</span><div><strong>이름을 적어 주세요.</strong><small>행사 참가 확인에만 사용합니다.</small></div></legend><label className="visit-name-field"><span>내 이름</span><input value={participantName} onChange={(event) => setParticipantName(event.target.value)} maxLength={30} autoComplete="name" placeholder="예: 김모아" required autoFocus /></label></fieldset>
          <fieldset><legend><span>02</span><div><strong>성별 <em>선택</em></strong><small>필요하지 않으면 건너뛰어도 됩니다.</small></div></legend><div className="choice-grid gender-grid">{GENDERS.map((item) => <label className={gender === item ? "selected" : ""} key={item}><input type="radio" value={item} checked={gender === item} onChange={() => setGender(item)} /><span className="choice-check">✓</span><strong>{item}</strong></label>)}</div></fieldset>
          <fieldset><legend><span>03</span><div><strong>연령 구분 <em>선택</em></strong><small>필요하지 않으면 건너뛰어도 됩니다.</small></div></legend><div className="choice-grid age-grid">{AGE_GROUP_OPTIONS.map((item) => <label className={ageGroup === item.value ? "selected" : ""} key={item.value}><input type="radio" value={item.value} checked={ageGroup === item.value} onChange={() => setAgeGroup(item.value)} /><span className="choice-check">✓</span><strong>{item.value}</strong><small>{item.detail}</small></label>)}</div></fieldset>
          {error && <p className="visit-error">{error}</p>}
          <button className="visit-submit" type="submit" disabled={!canSubmit || submitting}>{submitting ? "참가 등록 중이에요…" : canSubmit ? "참가하기 · 스탬프 투어 시작 →" : "이름을 입력해 주세요"}</button>
        </form>
      </section>
    </main>
  );
}

function TourCenter({ message, error = false, onRetry }: { message: string; error?: boolean; onRetry?: () => void }) {
  return <main className="visit-shell visit-center">{error ? <div className="error-symbol">!</div> : <div className="visit-loader" />}<h1>{error ? "QR을 확인해 주세요." : "잠시만 기다려 주세요."}</h1><p>{message}</p>{error && <div className="error-actions">{onRetry && <button onClick={onRetry}>다시 시도</button>}<a href="/" target="_top">모아 안내로 돌아가기</a></div>}</main>;
}

function formatPeriod(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}
