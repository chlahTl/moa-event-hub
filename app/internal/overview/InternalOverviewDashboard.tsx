"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { InternalOverviewData } from "../../../lib/internal-analytics";
import styles from "./overview.module.css";

const RANGE_OPTIONS = [
  { value: 7, label: "7일" },
  { value: 30, label: "30일" },
  { value: 90, label: "90일" },
] as const;

type Props = {
  operatorName: string;
  signOutHref: string;
};

export default function InternalOverviewDashboard({ operatorName, signOutHref }: Props) {
  const [range, setRange] = useState(30);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<InternalOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ range: String(range) });
      if (query) params.set("query", query);
      const response = await fetch(`/api/internal/overview?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const payload = await response.json() as InternalOverviewData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "운영 현황을 불러오지 못했습니다.");
      setData(payload);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "운영 현황을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query, range]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const chartMax = useMemo(() => Math.max(1, ...(data?.daily.map((day) => Math.max(
    day.loginCount,
    day.activeUsers,
    day.newUsers,
  )) ?? [1])), [data]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(draftQuery.normalize("NFKC").trim());
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MOA · OWNER VIEW</p>
          <h1>서비스 운영 현황</h1>
          <p>일반 이용자를 제외한 최고관리자 전용 화면입니다.</p>
        </div>
        <nav className={styles.headerActions} aria-label="최고관리자 메뉴">
          <span>{operatorName}</span>
          <a href="/admin">내 행사 관리</a>
          <a href={signOutHref}>로그아웃</a>
        </nav>
      </header>

      <section className={styles.toolbar} aria-label="조회 조건">
        <div className={styles.ranges}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={range === option.value ? styles.selected : ""}
              onClick={() => setRange(option.value)}
              aria-pressed={range === option.value}
            >
              최근 {option.label}
            </button>
          ))}
        </div>
        <form className={styles.search} onSubmit={submitSearch}>
          <label htmlFor="owner-user-search">이용자 검색</label>
          <input
            id="owner-user-search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="이름 또는 이메일"
            maxLength={100}
          />
          <button type="submit">검색</button>
        </form>
      </section>

      {error ? (
        <section className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>다시 불러오기</button>
        </section>
      ) : null}

      {loading && !data ? <p className={styles.loading}>운영 데이터를 불러오는 중입니다…</p> : null}

      {data ? (
        <>
          <section className={styles.metrics} aria-label="핵심 운영 지표">
            <Metric label="전체 이용자" value={data.summary.totalUsers} note="최고관리자 제외" />
            <Metric label={`신규 계정 · ${data.rangeDays}일`} value={data.summary.newUsers} note={`${shortDate(data.fromDate)}부터`} />
            <Metric label={`로그인 · ${data.rangeDays}일`} value={data.summary.loginCount} note="OAuth 성공 기준" />
            <Metric label={`활성 이용자 · ${data.rangeDays}일`} value={data.summary.activeUsers} note="로그인 후 이용 기준" />
            <Metric label="운영 중 행사" value={data.summary.totalEvents} note="삭제된 행사 제외" />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionLabel}>DAILY SIGNALS</p>
                <h2>날짜별 이용 흐름</h2>
              </div>
              <div className={styles.legend} aria-label="차트 범례">
                <span><i className={styles.loginDot} />로그인</span>
                <span><i className={styles.activeDot} />활성 이용자</span>
                <span><i className={styles.newDot} />신규 계정</span>
              </div>
            </div>
            <div className={styles.chartScroll}>
              <div className={styles.chart} style={{ minWidth: `${Math.max(720, data.daily.length * 34)}px` }}>
                {data.daily.map((day, index) => (
                  <div className={styles.chartDay} key={day.date} title={`${day.date} · 로그인 ${day.loginCount} · 활성 ${day.activeUsers} · 신규 ${day.newUsers}`}>
                    <div className={styles.bars}>
                      <i className={styles.loginBar} style={{ height: barHeight(day.loginCount, chartMax) }} />
                      <i className={styles.activeBar} style={{ height: barHeight(day.activeUsers, chartMax) }} />
                      <i className={styles.newBar} style={{ height: barHeight(day.newUsers, chartMax) }} />
                    </div>
                    <time dateTime={day.date}>{index % Math.max(1, Math.ceil(data.daily.length / 10)) === 0 ? shortDate(day.date) : ""}</time>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionLabel}>ACCOUNTS</p>
                <h2>이용자별 현황</h2>
              </div>
              <p>{query ? `“${query}” 검색 결과` : "최근 활동 순"} · 최대 100명</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>이용자</th>
                    <th>가입일</th>
                    <th>최근 활동</th>
                    <th>기간 로그인</th>
                    <th>사용 요청</th>
                    <th>행사</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.displayName || "이름 없음"}</strong>
                        <span>{user.email}</span>
                        <small>{user.providers.map(providerLabel).join(" · ") || "연결 정보 없음"}</small>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{user.lastActiveAt ? formatDateTime(user.lastActiveAt) : user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "기록 없음"}</td>
                      <td>{number(user.loginCount)}회</td>
                      <td>{number(user.requestCount)}회</td>
                      <td>{number(user.eventCount)}개</td>
                    </tr>
                  ))}
                  {!data.users.length ? (
                    <tr><td className={styles.empty} colSpan={6}>조건에 맞는 이용자가 없습니다.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <footer className={styles.footer}>
            로그인·활동 통계는 이 기능 적용 이후부터 쌓이며 상세 기록은 90일 동안 보관됩니다. 사용 요청은 인증된 페이지 및 API 접근 횟수입니다.
          </footer>
        </>
      ) : null}
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article>
      <p>{label}</p>
      <strong>{number(value)}</strong>
      <span>{note}</span>
    </article>
  );
}

function barHeight(value: number, maximum: number) {
  return value ? `${Math.max(5, (value / maximum) * 100)}%` : "2px";
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(parseTimestamp(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseTimestamp(value));
}

function parseTimestamp(value: string) {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value.replace(" ", "T")}Z`);
}

function providerLabel(provider: string) {
  return provider === "google" ? "Google" : provider === "naver" ? "네이버" : provider;
}

function number(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
