import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const ogUrl = `${protocol}://${host}/og.png`;
  return {
    title: "모아 | 행사 참여를 한곳에",
    description: "행사와 부스·동아리별 참여 정보를 QR로 받고 자동으로 분류·집계합니다.",
    openGraph: {
      title: "모아 | 행사 참여를 한곳에",
      description: "행사 생성부터 부스별 QR, 참여 통계와 엑셀 내려받기까지.",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: "모아 행사 참여 관리" }],
    },
    twitter: { card: "summary_large_image", images: [ogUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={geist.variable}>{children}<ServiceWorkerRegistration /></body>
    </html>
  );
}
