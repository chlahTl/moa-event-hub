export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <a href="/" target="_top" className="brand-lockup" aria-label="모아 홈">
          <span className="brand-mark">ㅁ</span>
          <span>모아</span>
        </a>
        <span className="institution-chip">NCHM 연계 행사 운영 시안</span>
        <a href="/admin" target="_top" className="text-link">관리자 화면 <span>↗</span></a>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow"><span /> EVENT PARTICIPATION SYSTEM</p>
          <h1>행사 참여를<br /><em>한곳에</em></h1>
          <p className="hero-description">
            행사 아래 여러 동아리를 만들고, 각 동아리에 필요한 정보만 받으세요.
            QR 입력부터 분류·집계·엑셀 내려받기까지 하나의 흐름으로 이어집니다.
          </p>
          <div className="hero-actions">
            <a href="/admin" target="_top" className="button button-primary">첫 행사 만들기 <span>→</span></a>
            <a href="#flow" className="button button-ghost">작동 방식 보기</a>
          </div>
          <div className="hero-proof">
            <div><strong>01</strong><span>행사 생성</span></div>
            <div><strong>02</strong><span>동아리별 QR</span></div>
            <div><strong>03</strong><span>자동 분류</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="행사에서 여러 동아리 입력으로 연결되는 구조">
          <div className="event-card-preview">
            <span className="preview-label">진행 중인 행사</span>
            <h2>2026 여름 공동체 주간</h2>
            <p>NCHM · 8월 12일</p>
            <div className="preview-metric"><span>전체 참여</span><strong>128<small>명</small></strong></div>
          </div>
          <div className="branch-line branch-one" />
          <div className="branch-line branch-two" />
          <div className="branch-line branch-three" />
          <div className="club-preview club-one"><i>01</i><div><strong>청년 찬양팀</strong><span>성별 · 연령 구분</span></div><b>⌗</b></div>
          <div className="club-preview club-two"><i>02</i><div><strong>아동 미술반</strong><span>연령 구분</span></div><b>⌗</b></div>
          <div className="club-preview club-three"><i>03</i><div><strong>환영 안내팀</strong><span>성별</span></div><b>⌗</b></div>
          <div className="visual-caption"><span /> 동아리마다 받을 항목을 다르게</div>
        </div>
      </section>

      <section className="flow-section" id="flow">
        <div className="section-heading">
          <p className="eyebrow"><span /> HOW IT WORKS</p>
          <h2>수기 입력을<br />세 단계로 줄입니다.</h2>
        </div>
        <div className="flow-grid">
          <article><span>01</span><div className="flow-icon">＋</div><h3>큰 행사를 만듭니다</h3><p>행사명, 기관명, 날짜와 장소를 한 번만 입력합니다.</p></article>
          <article><span>02</span><div className="flow-icon">⌘</div><h3>동아리를 나눕니다</h3><p>동아리별로 성별 또는 연령 구분 중 필요한 항목만 선택합니다.</p></article>
          <article><span>03</span><div className="flow-icon">↧</div><h3>자동으로 모읍니다</h3><p>QR 응답이 동아리와 행사에 맞게 저장되고 엑셀용 파일로 정리됩니다.</p></article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="brand-lockup"><span className="brand-mark">ㅁ</span><span>모아</span></div>
        <p>NCHM 관련 행사 운영을 위한 독립형 1차 시안</p>
        <a href="/admin" target="_top">관리자 화면 시작하기 →</a>
      </footer>
    </main>
  );
}
