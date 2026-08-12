const OPERATION_STEPS = [
  ["01", "행사 만들기", "일정과 장소를 정합니다."],
  ["02", "참가 등록", "입구 QR로 참가자를 받습니다."],
  ["03", "부스 참여", "각 부스 QR로 참여를 기록합니다."],
  ["04", "현황 확인", "참가 등록과 부스 참여를 확인합니다."],
];

export default function Home() {
  return (
    <main className="landing-shell editorial-home">
      <nav className="landing-nav">
        <a href="/" target="_top" className="brand-lockup" aria-label="모아 홈">
          <span className="brand-mark">ㅁ</span><span>모아</span>
        </a>
        <span className="nav-context">QR 행사 운영</span>
        <a href="/signin?returnTo=%2Fadmin" target="_top" className="text-link">운영자 로그인 <span>→</span></a>
      </nav>

      <section className="editorial-hero" aria-labelledby="home-title">
        <div className="editorial-intro">
          <p className="home-category">행사 준비 · 현장 참여 · 결과 확인</p>
          <h1 id="home-title">QR로 연결되는<br />행사 운영</h1>
          <p>행사와 부스를 준비하고, 현장 참여를 기록하고, 결과를 한곳에서 확인합니다.</p>
          <a href="/signin?returnTo=%2Fadmin" target="_top" className="home-primary-action">로그인하고 행사 만들기 <span>→</span></a>
          <p className="home-participant-note"><strong>참가자는 로그인하지 않습니다.</strong> 현장에서 안내받은 QR을 스캔하면 바로 참여할 수 있습니다.</p>
        </div>

        <div className="field-preview" aria-label="QR을 활용한 행사 운영 예시">
          <div className="field-preview-heading">
            <div><span>운영 예시</span><strong>청소년 체험 행사</strong></div>
            <time>8월 12일 · 10:00–17:00</time>
          </div>
          <div className="field-preview-body">
            <div className="field-board">
              <span className="live-status"><i /> 운영 중</span>
              <strong>참가 등록 <b>128명</b></strong>
              <p>부스 참여 346건 · 16:40 갱신</p>
            </div>
            <div className="sample-qr" aria-label="참가 등록 QR 예시 이미지">
              <span>예시</span>
              <div className="sample-qr-pattern" aria-hidden="true">⌗</div>
              <strong>참가 등록 QR</strong>
              <small>실제 참여용 QR이 아닙니다.</small>
            </div>
          </div>
          <div className="field-preview-footer"><span>입구에서 참가 등록</span><span>부스에서 참여 기록</span><span>운영 화면에서 즉시 확인</span></div>
        </div>
      </section>

      <section className="operation-story" id="flow" aria-labelledby="flow-title">
        <header>
          <p>현장 운영 흐름</p>
          <h2 id="flow-title">행사를 만드는 순간부터<br />결과가 정리될 때까지</h2>
        </header>
        <ol>
          {OPERATION_STEPS.map(([number, title, description]) => (
            <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="role-split" aria-label="운영자와 참가자의 이용 흐름">
        <div><span>운영자</span><h2>현장을 준비하고 판단합니다.</h2><p>행사·부스 설정, QR 준비, 참가 등록과 부스 참여 현황, 결과 내보내기를 관리합니다.</p></div>
        <div><span>참가자</span><h2>안내받은 QR로 바로 참여합니다.</h2><p>행사 QR에서 정보를 등록한 뒤 각 부스 QR을 스캔하고 완료 상태를 확인합니다.</p></div>
      </section>

      <footer className="landing-footer">
        <div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div>
        <p>앞에서는 행사를 환영하고, 뒤에서는 현장을 정확하게 운영합니다.</p>
        <a href="/signin?returnTo=%2Fadmin" target="_top">운영자 로그인 →</a>
      </footer>
    </main>
  );
}
