type AdminAccessDeniedProps = {
  email: string;
  signOutHref: string;
};

export default function AdminAccessDenied({
  email,
  signOutHref,
}: AdminAccessDeniedProps) {
  return (
    <main className="visit-shell success-shell">
      <header className="visit-header">
        <a href="/" className="brand-lockup" aria-label="모아 홈으로 이동">
          <span className="brand-mark">ㅁ</span>
          <span>모아</span>
        </a>
        <span>관리자 접근 제한</span>
      </header>

      <section className="success-content" aria-labelledby="access-denied-title">
        <div className="success-mark" aria-hidden="true">
          <span>!</span>
          <i />
          <i />
        </div>
        <p className="eyebrow"><span /> ADMIN ACCESS</p>
        <h1 id="access-denied-title">관리자 권한이 없습니다.</h1>
        <p>
          <strong>{email}</strong> 계정은 모아 관리자 허용 목록에 없습니다.
          권한이 있는 ChatGPT 계정으로 다시 로그인해 주세요.
        </p>
        <div className="success-hint">
          <span aria-hidden="true">↗</span>
          <p>
            <strong>다른 계정으로 로그인</strong><br />
            현재 계정에서 안전하게 로그아웃한 뒤 관리자 계정으로 접속할 수
            있습니다.
          </p>
        </div>
        <a className="button button-primary" href={signOutHref}>
          로그아웃하고 홈으로 이동 →
        </a>
      </section>
    </main>
  );
}
