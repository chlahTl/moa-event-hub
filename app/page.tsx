export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <a href="/" target="_top" className="brand-lockup" aria-label="모아 홈">
          <span className="brand-mark">ㅁ</span>
          <span>모아</span>
        </a>
        <span className="nav-context">행사 운영 도구</span>
        <a href="/signin?returnTo=%2Fadmin" target="_top" className="text-link">운영자 로그인 <span>→</span></a>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow"><span /> EVENT PARTICIPATION SYSTEM</p>
          <h1>행사 참여를<br /><em>한곳에</em></h1>
          <p className="hero-description">
            행사 아래 여러 부스·동아리를 만들고, 각 참여처에 필요한 정보만 받으세요.
            QR 입력부터 분류·집계·엑셀 내려받기까지 하나의 흐름으로 이어집니다.
          </p>
          <div className="hero-actions">
            <a href="/signin?returnTo=%2Fadmin" target="_top" className="button button-primary">로그인하고 행사 만들기 <span>→</span></a>
            <a href="#flow" className="button button-ghost">작동 방식 보기</a>
          </div>
          <p className="hero-auth-note">행사를 만들거나 관리하려면 운영자 로그인이 필요합니다. 참가자는 로그인 없이 QR로 참여합니다.</p>
          <div className="hero-proof">
            <div><strong>01</strong><span>행사 생성</span></div>
            <div><strong>02</strong><span>부스별 QR</span></div>
            <div><strong>03</strong><span>자동 분류</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="행사에서 여러 부스·동아리 참여로 연결되는 구조">
          <div className="event-card-preview">
            <span className="preview-label">행사 관리</span>
            <h2>참여 현황</h2>
            <p>일정 · 장소 · 응답을 한곳에서</p>
            <div className="preview-metric"><span>참가자 응답</span><strong>자동 집계</strong></div>
          </div>
          <div className="branch-line branch-one" />
          <div className="branch-line branch-two" />
          <div className="branch-line branch-three" />
          <div className="club-preview club-one"><i>01</i><div><strong>참여 QR</strong><span>필요한 항목만 수집</span></div><b>⌗</b></div>
          <div className="club-preview club-two"><i>02</i><div><strong>자동 분류</strong><span>행사 · 부스별 정리</span></div><b>≡</b></div>
          <div className="club-preview club-three"><i>03</i><div><strong>자료 내보내기</strong><span>CSV 파일로 저장</span></div><b>↓</b></div>
          <div className="visual-caption"><span /> 행사 생성부터 현장 참여 기록까지 하나의 흐름으로 관리합니다.</div>
        </div>
      </section>

      <section className="flow-section" id="flow">
        <div className="section-heading">
          <p className="eyebrow"><span /> HOW IT WORKS</p>
          <h2>수기 입력을<br />세 단계로 줄입니다.</h2>
        </div>
        <div className="flow-grid">
          <article><span>01</span><div className="flow-icon">＋</div><h3>행사를 등록합니다</h3><p>행사명, 기관명, 날짜와 장소를 한 번 입력해 운영 기준을 만듭니다.</p></article>
          <article><span>02</span><div className="flow-icon">⌘</div><h3>참여 항목을 구성합니다</h3><p>부스·동아리마다 필요한 정보만 선택하고 전용 QR을 발급합니다.</p></article>
          <article><span>03</span><div className="flow-icon">↧</div><h3>응답을 확인합니다</h3><p>참여 기록을 행사와 부스·동아리별로 확인하고 CSV 파일로 내려받습니다.</p></article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div>
        <p>행사 운영과 참여 기록을 한곳에</p>
        <a href="/signin?returnTo=%2Fadmin" target="_top">운영자 로그인 →</a>
      </footer>
    </main>
  );
}
