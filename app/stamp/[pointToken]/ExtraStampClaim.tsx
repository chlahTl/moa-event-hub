"use client";

import { useEffect, useState } from "react";

type ClaimResult = {
  event: { name: string; inviteToken: string };
  stampedPoint: { name: string };
  successMessage: string;
  extraProgress: { completed: number; total: number };
};

export default function StampClaim({ pointToken }: { pointToken: string }) {
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stamps/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointToken }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "스탬프를 등록하지 못했습니다.");
        setResult(data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "스탬프를 등록하지 못했습니다."));
  }, [pointToken]);

  if (error) return <main className="visit-shell visit-center"><div className="error-symbol">!</div><h1>스탬프를 받을 수 없어요.</h1><p>{error}</p><div className="error-actions"><button onClick={() => window.location.reload()}>다시 시도</button><a href="/" target="_top">모아 안내로 돌아가기</a></div></main>;
  if (!result) return <main className="visit-shell visit-center"><div className="visit-loader" /><strong>스탬프를 확인하고 있어요.</strong></main>;
  return (
    <main className="visit-shell success-shell">
      <section className="success-content">
        <div className="success-mark"><span>✓</span><i /><i /></div>
        <p className="eyebrow"><span /> STAMP COMPLETE</p>
        <h1>{result.stampedPoint.name}<br />스탬프 완료!</h1>
        <p>{result.successMessage}<br />추가 지점 {result.extraProgress.total}곳 중 {result.extraProgress.completed}곳을 완료했습니다.</p>
        <a className="button button-primary" target="_top" href={`/join/${result.event.inviteToken}`}>내 스탬프 현황 보기 →</a>
      </section>
    </main>
  );
}
