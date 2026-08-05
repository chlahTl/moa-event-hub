"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ClubInfo = {
  id: string;
  name: string;
  description: string;
  collectGender: boolean;
  collectAge: boolean;
  eventName: string;
  institution: string;
  eventDate: string;
  location: string;
};

type ClubStampResult = {
  event: { name: string; inviteToken: string };
  participant: { name: string };
  stampedClub: { name: string };
  successMessage: string;
  progress: { completed: number; total: number };
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

export default function VisitForm({ clubId }: { clubId: string }) {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "success" | "stampSuccess" | "error">("loading");
  const [error, setError] = useState("");
  const [stampResult, setStampResult] = useState<ClubStampResult | null>(null);

  useEffect(() => {
    fetch(`/api/clubs/${encodeURIComponent(clubId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setClub(data.club);
        const claimResponse = await fetch("/api/stamps/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubId }),
        });
        const claimData = await claimResponse.json();
        if (claimResponse.ok) {
          setStampResult(claimData);
          setStatus("stampSuccess");
          return;
        }
        if (claimResponse.status === 401) {
          setStatus("ready");
          return;
        }
        throw new Error(claimData.error || "동아리 QR을 처리하지 못했습니다.");
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "입력 화면을 열지 못했습니다.");
        setStatus("error");
      });
  }, [clubId]);

  const fields = useMemo(() => 1 + [club?.collectGender, club?.collectAge].filter(Boolean).length, [club]);
  const completed = useMemo(
    () => [participantName.trim(), club?.collectGender ? gender : true, club?.collectAge ? ageGroup : true].filter(Boolean).length,
    [club, participantName, gender, ageGroup],
  );
  const canSubmit = Boolean(participantName.trim() && club && (!club.collectGender || gender) && (!club.collectAge || ageGroup));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError("");
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, participantName, gender, ageGroup }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "저장하지 못했습니다.");
      setStatus("ready");
      return;
    }
    setStatus("success");
  }

  if (status === "loading") return <LoadingVisit />;
  if (status === "error" || !club) return <VisitError message={error} />;
  if (status === "stampSuccess" && stampResult) return <ClubStampSuccess result={stampResult} institution={club.institution} />;
  if (status === "success") return <Success club={club} participantName={participantName.trim()} />;

  return (
    <main className="visit-shell">
      <header className="visit-header">
        <div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div>
        <span>{club.institution}</span>
      </header>
      <div className="visit-progress"><span style={{ width: `${Math.max(8, (completed / Math.max(fields, 1)) * 100)}%` }} /></div>
      <section className="visit-content">
        <div className="visit-event-line"><span>QR 연결 완료</span><i /> <span>{club.eventName}</span></div>
        <h1>{club.name}</h1>
        <p className="visit-description">{club.description || "반가워요! 아래 정보를 차례대로 알려주세요."}</p>
        <div className="privacy-note"><span>✓</span><p><strong>연락처는 받지 않아요.</strong><br />이름과 선택한 정보는 행사 참여 확인에만 사용됩니다.</p></div>

        <form className="visit-form" onSubmit={submit}>
          <fieldset>
            <legend><span>01</span><div><strong>이름을 적어 주세요.</strong><small>참여한 사람을 확인하기 위해 필요해요.</small></div></legend>
            <label className="visit-name-field">
              <span>내 이름</span>
              <input
                type="text"
                name="participantName"
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={30}
                placeholder="예: 김모아"
                required
                autoFocus
              />
            </label>
          </fieldset>

          {club.collectGender && (
            <fieldset>
              <legend><span>02</span><div><strong>성별을 골라 주세요.</strong><small>한 가지만 선택할 수 있어요.</small></div></legend>
              <div className="choice-grid gender-grid">
                {GENDERS.map((item) => <label className={gender === item ? "selected" : ""} key={item}><input type="radio" name="gender" value={item} checked={gender === item} onChange={() => setGender(item)} /><span className="choice-check">✓</span><strong>{item}</strong></label>)}
              </div>
            </fieldset>
          )}

          {club.collectAge && (
            <fieldset>
              <legend><span>{club.collectGender ? "03" : "02"}</span><div><strong>나이에 맞는 칸을 골라 주세요.</strong><small>내 나이가 들어가는 범위를 선택해요.</small></div></legend>
              <div className="choice-grid age-grid">
                {AGES.map((item) => <label className={ageGroup === item.value ? "selected" : ""} key={item.value}><input type="radio" name="ageGroup" value={item.value} checked={ageGroup === item.value} onChange={() => setAgeGroup(item.value)} /><span className="choice-check">✓</span><strong>{item.value}</strong><small>{item.detail}</small></label>)}
              </div>
            </fieldset>
          )}

          {error && <p className="visit-error">{error}</p>}
          <button className="visit-submit" type="submit" disabled={!canSubmit || status === "submitting"}>
            {status === "submitting" ? "참여 정보를 보내고 있어요…" : canSubmit ? "다 적었어요 · 참여하기 →" : "위 내용을 모두 입력해 주세요"}
          </button>
        </form>
        <p className="visit-footer-note">제출하면 이 동아리의 참여 실적으로 기록됩니다.</p>
      </section>
    </main>
  );
}

function ClubStampSuccess({ result, institution }: { result: ClubStampResult; institution: string }) {
  return (
    <main className="visit-shell success-shell">
      <header className="visit-header"><div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div><span>{institution}</span></header>
      <section className="success-content">
        <div className="success-mark"><span>✓</span><i /><i /></div>
        <p className="eyebrow"><span /> CLUB STAMP COMPLETE</p>
        <h1>{result.stampedClub.name}<br />참여 완료!</h1>
        <p>{result.successMessage}<br />현재 {result.progress.total}개 동아리 중 {result.progress.completed}개에 참여했습니다.</p>
        <a className="button button-primary" target="_top" href={`/join/${result.event.inviteToken}`}>내 동아리 스탬프 보기 →</a>
      </section>
    </main>
  );
}

function LoadingVisit() {
  return <main className="visit-shell visit-center"><div className="visit-loader" /><strong>입력 화면을 준비하고 있습니다.</strong></main>;
}

function VisitError({ message }: { message: string }) {
  return <main className="visit-shell visit-center"><div className="error-symbol">!</div><h1>QR을 다시 확인해 주세요.</h1><p>{message}</p></main>;
}

function Success({ club, participantName }: { club: ClubInfo; participantName: string }) {
  return (
    <main className="visit-shell success-shell">
      <header className="visit-header"><div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div><span>{club.institution}</span></header>
      <section className="success-content">
        <div className="success-mark"><span>✓</span><i /><i /></div>
        <p className="eyebrow"><span /> 참여 완료!</p>
        <h1>{participantName} 님,<br />참여했어요!</h1>
        <p><strong>{club.name}</strong> 참여가 잘 기록되었습니다. 다른 동아리에도 참여하려면 그 동아리의 QR을 새로 스캔해 주세요.</p>
        <div className="success-summary"><span>행사</span><strong>{club.eventName}</strong><span>동아리</span><strong>{club.name}</strong><span>이름</span><strong>{participantName}</strong></div>
        <div className="success-hint"><span>⌗</span><p><strong>여러 동아리에 참여해도 괜찮아요.</strong><br />동아리마다 한 번씩 QR을 스캔하면 각각 참여로 기록돼요.</p></div>
      </section>
    </main>
  );
}
