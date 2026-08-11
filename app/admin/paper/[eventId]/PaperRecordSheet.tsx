"use client";

import { useMemo, useState } from "react";

type PaperEvent = {
  id: string;
  name: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  stampEnabled: boolean;
};

type Booth = { id: string; name: string };
type PaperClub = Booth & { collectGender: boolean; collectAge: boolean };
type OptionalField = "contact" | "affiliation" | "gender" | "ageGroup" | "visitedAt" | "signature";

const FIELD_LABELS: Record<OptionalField, string> = {
  contact: "학번 또는 연락처",
  affiliation: "소속",
  gender: "성별",
  ageGroup: "연령 구분",
  visitedAt: "방문 시간",
  signature: "확인자 서명",
};

export default function PaperRecordSheet({ event, club, booths: initialBooths }: { event: PaperEvent; club?: PaperClub; booths: Booth[] }) {
  const [title, setTitle] = useState(club ? `${club.name} 참가 기록지` : `${event.name} 참가 기록지`);
  const [subtitle, setSubtitle] = useState(club ? `${event.name} · ${event.institution}` : event.institution);
  const [rowCount, setRowCount] = useState(club ? 7 : event.stampEnabled ? 6 : 8);
  const [fields, setFields] = useState<Record<OptionalField, boolean>>({
    contact: true,
    affiliation: true,
    gender: club?.collectGender ?? false,
    ageGroup: club?.collectAge ?? false,
    visitedAt: true,
    signature: true,
  });
  const [booths, setBooths] = useState(initialBooths.map((booth) => ({ ...booth })));
  const visibleFields = useMemo(
    () => (Object.keys(fields) as OptionalField[]).filter((field) => fields[field]),
    [fields],
  );
  const columnCount = visibleFields.length + 2;

  function updateBooth(id: string, name: string) {
    setBooths((current) => current.map((booth) => booth.id === id ? { ...booth, name } : booth));
  }

  function addBooth() {
    setBooths((current) => [...current, { id: `custom-${crypto.randomUUID()}`, name: "새 확인 항목" }]);
  }

  return (
    <main className="paper-page-shell">
      <aside className="paper-controls" aria-label="기록지 설정">
        <div className="paper-controls-heading">
          <a href="/admin">← 관리자 화면</a>
          <div><span>{club ? "동아리별 종이 접수 양식" : "행사 종이 접수 양식"}</span><h1>인쇄 항목 설정</h1></div>
        </div>
        {club && <div className="paper-scope-note"><span>동아리 전용</span><strong>{club.name}</strong><p>이 양식의 기록은 온라인 등록 시 해당 동아리 스탬프로 선택할 수 있습니다.</p></div>}
        <label>양식 제목<input value={title} maxLength={80} onChange={(change) => setTitle(change.target.value)} /></label>
        <label>기관·부제<input value={subtitle} maxLength={80} onChange={(change) => setSubtitle(change.target.value)} /></label>
        <label>한 장의 기록 줄 수
          <select value={rowCount} onChange={(change) => setRowCount(Number(change.target.value))}>
            {[4, 5, 6, 7, 8].map((count) => <option value={count} key={count}>{count}명</option>)}
          </select>
        </label>
        <fieldset>
          <legend>손으로 적을 항목</legend>
          {(Object.keys(FIELD_LABELS) as OptionalField[]).map((field) => (
            <label className="paper-control-check" key={field}>
              <input type="checkbox" checked={fields[field]} onChange={(change) => setFields((current) => ({ ...current, [field]: change.target.checked }))} />
              <span>{FIELD_LABELS[field]}</span>
            </label>
          ))}
        </fieldset>
        {event.stampEnabled && (
          <fieldset>
            <legend>스탬프 확인 항목</legend>
            <p>인쇄 전에 동아리·부스 이름을 수정할 수 있습니다.</p>
            <div className="paper-booth-editor">
              {booths.map((booth) => (
                <div key={booth.id}>
                  <input aria-label="스탬프 확인 항목명" value={booth.name} maxLength={40} onChange={(change) => updateBooth(booth.id, change.target.value)} />
                  <button type="button" onClick={() => setBooths((current) => current.filter((item) => item.id !== booth.id))} aria-label={`${booth.name} 제거`}>×</button>
                </div>
              ))}
              <button type="button" className="paper-add-booth" onClick={addBooth}>＋ 확인 항목 추가</button>
            </div>
          </fieldset>
        )}
        <button className="button button-primary paper-print-button" type="button" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        <p className="paper-save-note">인쇄 창에서 프린터를 선택하거나 ‘PDF로 저장’을 선택하세요.</p>
      </aside>

      <section className="paper-preview" aria-label="A4 기록지 미리보기">
        <article className="paper-sheet">
          <header className="paper-sheet-header">
            <div><span>MOA · PARTICIPANT RECORD</span><h2>{title || "참가 기록지"}</h2><p>{subtitle}</p></div>
            <dl>
              <div><dt>행사 기간</dt><dd>{formatPeriod(event.startDate, event.endDate)}</dd></div>
              <div><dt>장소</dt><dd>{event.location || "________________"}</dd></div>
              {club && <div><dt>동아리</dt><dd>{club.name}</dd></div>}
            </dl>
          </header>
          <div className="paper-guidance"><strong>작성 안내</strong><span>참가자 정보를 확인한 뒤 빈칸에 정자로 작성해 주세요.</span></div>
          <div className="paper-record-list">
            {Array.from({ length: rowCount }, (_, index) => (
              <section className="paper-record-row" key={index}>
                <div className="paper-info-grid" style={{ gridTemplateColumns: `34px repeat(${columnCount - 1}, minmax(0, 1fr))` }}>
                  <div className="paper-row-number"><span>번호</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
                  <PaperBlank label="참가자 이름" />
                  {visibleFields.map((field) => <PaperBlank label={FIELD_LABELS[field]} key={field} />)}
                </div>
                {event.stampEnabled && booths.some((booth) => booth.name.trim()) && (
                  <div className="paper-stamp-row">
                    <strong>스탬프 확인</strong>
                    <div>{booths.filter((booth) => booth.name.trim()).map((booth) => <span key={booth.id}><i />{booth.name.trim()}</span>)}</div>
                  </div>
                )}
              </section>
            ))}
          </div>
          <footer className="paper-sheet-footer"><span>종이 기록은 행사 종료 후 관리자 화면에서 온라인 기록으로 등록할 수 있습니다.</span><strong>모아</strong></footer>
        </article>
      </section>
    </main>
  );
}

function PaperBlank({ label }: { label: string }) {
  return <div className="paper-blank"><span>{label}</span><i /></div>;
}

function formatPeriod(startDate: string, endDate: string) {
  if (startDate === endDate) return startDate;
  return `${startDate} ~ ${endDate}`;
}
