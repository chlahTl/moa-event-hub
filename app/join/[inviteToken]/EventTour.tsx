"use client";

import type { IScannerControls } from "@zxing/browser";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { id: string; name: string; description: string; visited: boolean; visitedAt: string | null };
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
  points: Point[];
  progress: { completed: number; total: number; percent: number };
  successMessage: string;
};

const GENDERS = ["여성", "남성", "응답하지 않음"];
const AGES = [
  { value: "유아", detail: "8세 이하" },
  { value: "초등", detail: "9~13세" },
  { value: "중등", detail: "14~16세" },
  { value: "고등", detail: "17~19세" },
  { value: "청년", detail: "20~24세" },
  { value: "후기", detail: "25~39세" },
];

export default function EventTour({ inviteToken }: { inviteToken: string }) {
  const [tour, setTour] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [claiming, setClaiming] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanLocked = useRef(false);
  const scannerSession = useRef(0);

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

  async function claimStamp(pointToken: string) {
    setClaiming(true);
    setError("");
    const response = await fetch("/api/stamps/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "스탬프를 등록하지 못했습니다.");
    setTour(data);
    closeScanner();
    setClaiming(false);
  }

  async function handleScannedText(text: string) {
    try {
      const url = new URL(text, window.location.origin);
      const match = url.pathname.match(/^\/stamp\/([^/]+)\/?$/);
      if (!match) throw new Error("스탬프 지점 QR이 아닙니다. 행사장에 설치된 QR을 스캔해 주세요.");
      setScannerStatus("스탬프를 확인하고 있어요…");
      await claimStamp(decodeURIComponent(match[1]));
    } catch (caught) {
      setClaiming(false);
      scanLocked.current = false;
      setScannerStatus(caught instanceof Error ? caught.message : "QR을 확인하지 못했습니다.");
    }
  }

  async function startScanner() {
    const session = ++scannerSession.current;
    setScannerOpen(true);
    setScannerStatus("카메라를 준비하고 있어요…");
    scanLocked.current = false;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저에서는 카메라 스캔을 지원하지 않습니다.");
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      if (!videoRef.current) throw new Error("카메라 화면을 준비하지 못했습니다.");
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

  if (loading) return <TourCenter message="행사 참여 화면을 준비하고 있어요." />;
  if (error && !tour) return <TourCenter error message={error} />;
  if (!tour) return null;
  if (!tour.participant) {
    return <JoinForm inviteToken={inviteToken} event={tour.event} onJoined={setTour} />;
  }

  const remaining = tour.points.filter((point) => !point.visited);
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
          <p>{tour.event.description || "행사장의 QR을 찾아 스탬프를 모아 보세요."}</p>
        </div>
        <button className="scan-button" onClick={startScanner}><span>⌗</span> QR 스캔</button>
      </section>

      {tour.successMessage && <div className="stamp-success" role="status"><span>✓</span>{tour.successMessage}</div>}
      {error && <div className="tour-error" role="alert">{error}</div>}

      <section className="tour-progress-card">
        <div className="tour-count"><strong>{tour.progress.completed}</strong><span>/ {tour.progress.total}</span></div>
        <div className="tour-progress-copy">
          <div><strong>{tour.progress.total}개 지점 중 {tour.progress.completed}개 완료</strong><span>{tour.progress.percent}%</span></div>
          <div className="tour-progress-track"><i style={{ width: `${tour.progress.percent}%` }} /></div>
          <p>{remaining.length ? `앞으로 ${remaining.length}개 지점이 남았어요.` : tour.points.length ? "모든 지점을 방문했어요!" : "관리자가 지점을 준비하고 있어요."}</p>
        </div>
      </section>

      <section className="tour-points">
        <div className="tour-section-heading"><div><p>MY STAMPS</p><h2>스탬프 현황</h2></div><button onClick={startScanner}>카메라 열기</button></div>
        {tour.points.length ? (
          <div className="tour-point-grid">
            {tour.points.map((point, index) => (
              <article className={point.visited ? "tour-point visited" : "tour-point"} key={point.id}>
                <div className="stamp-medal">{point.visited ? "✓" : String(index + 1).padStart(2, "0")}</div>
                <div><span>{point.visited ? "방문 완료" : "아직 방문 전"}</span><h3>{point.name}</h3><p>{point.description || "현장에서 지점 QR을 찾아 주세요."}</p></div>
              </article>
            ))}
          </div>
        ) : <div className="tour-empty">등록된 스탬프 지점이 아직 없습니다.</div>}
      </section>

      {scannerOpen && (
        <div className="scanner-backdrop" role="dialog" aria-modal="true" aria-label="QR 스캐너">
          <section className="scanner-panel">
            <button className="scanner-close" onClick={closeScanner} aria-label="스캐너 닫기">×</button>
            <p className="tour-kicker">POINT QR SCAN</p>
            <h2>지점 QR을 비춰 주세요.</h2>
            <div className="scanner-frame"><video ref={videoRef} muted playsInline /><i /><i /><i /><i /></div>
            <p className={scannerStatus.includes("거부") || scannerStatus.includes("아닙니다") ? "scanner-message error" : "scanner-message"}>{claiming ? "스탬프를 등록하고 있어요…" : scannerStatus}</p>
            <small>카메라 사용이 어렵다면 휴대폰 기본 카메라로 지점 QR을 열어도 자동 등록됩니다.</small>
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
  const canSubmit = useMemo(() => Boolean(participantName.trim() && gender && ageGroup), [participantName, gender, ageGroup]);

  async function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/tour/${encodeURIComponent(inviteToken)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantName, gender, ageGroup }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "참가 등록을 완료하지 못했습니다.");
      setSubmitting(false);
      return;
    }
    onJoined(data);
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
          <fieldset><legend><span>02</span><div><strong>성별을 골라 주세요.</strong><small>한 가지만 선택할 수 있어요.</small></div></legend><div className="choice-grid gender-grid">{GENDERS.map((item) => <label className={gender === item ? "selected" : ""} key={item}><input type="radio" value={item} checked={gender === item} onChange={() => setGender(item)} /><span className="choice-check">✓</span><strong>{item}</strong></label>)}</div></fieldset>
          <fieldset><legend><span>03</span><div><strong>나이에 맞는 칸을 골라 주세요.</strong><small>내 나이가 들어가는 범위를 선택해요.</small></div></legend><div className="choice-grid age-grid">{AGES.map((item) => <label className={ageGroup === item.value ? "selected" : ""} key={item.value}><input type="radio" value={item.value} checked={ageGroup === item.value} onChange={() => setAgeGroup(item.value)} /><span className="choice-check">✓</span><strong>{item.value}</strong><small>{item.detail}</small></label>)}</div></fieldset>
          {error && <p className="visit-error">{error}</p>}
          <button className="visit-submit" type="submit" disabled={!canSubmit || submitting}>{submitting ? "참가 등록 중이에요…" : canSubmit ? "참가하기 · 스탬프 투어 시작 →" : "위 내용을 모두 입력해 주세요"}</button>
        </form>
      </section>
    </main>
  );
}

function TourCenter({ message, error = false }: { message: string; error?: boolean }) {
  return <main className="visit-shell visit-center">{error ? <div className="error-symbol">!</div> : <div className="visit-loader" />}<h1>{error ? "QR을 확인해 주세요." : "잠시만 기다려 주세요."}</h1><p>{message}</p></main>;
}

function formatPeriod(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
}
