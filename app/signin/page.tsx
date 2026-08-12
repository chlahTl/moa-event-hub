type SignInPageProps = {
  searchParams: Promise<{ returnTo?: string; error?: string; provider?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "로그인이 취소되었습니다.",
  configuration: "현재 선택한 로그인 방식으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  invalid: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  failed: "계정 정보를 확인하지 못했습니다. 이메일 제공에 동의했는지 확인하고 다시 시도해 주세요.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith("/") ? params.returnTo : "/admin";
  const error = params.error ? ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.failed : "";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <a href="/" className="brand-lockup auth-brand" aria-label="모아 홈">
          <span className="brand-mark">ㅁ</span><span>모아</span>
        </a>
        <p className="auth-kicker">운영자 로그인</p>
        <h1>행사 운영을<br />시작하세요.</h1>
        <p className="auth-intro">행사 생성과 QR 준비, 참여 현황 확인은 운영자 로그인 후 이용할 수 있습니다. 로그인하면 바로 행사 관리 화면으로 이동합니다.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="auth-provider-list">
          <a className="provider-signin-button google-signin-button" href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`}>
          <span aria-hidden="true">G</span>Google 계정으로 계속
          </a>
          <a className="provider-signin-button naver-signin-button" href={`/api/auth/naver?returnTo=${encodeURIComponent(returnTo)}`}>
            <span aria-hidden="true">N</span>네이버 계정으로 계속
          </a>
        </div>
        <p className="auth-note">참가자는 별도 로그인 없이 행사 QR로 참여할 수 있습니다.</p>
        <a className="auth-back" href="/">← 소개 화면으로 돌아가기</a>
      </section>
    </main>
  );
}
