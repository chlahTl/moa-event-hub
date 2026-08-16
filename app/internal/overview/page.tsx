import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSuperAdmin, requireAppUser, signOutPath } from "../../auth";
import InternalOverviewDashboard from "./InternalOverviewDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서비스 운영 현황 | 모아",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InternalOverviewPage() {
  const user = await requireAppUser("/internal/overview");
  if (!isSuperAdmin(user)) notFound();

  return (
    <InternalOverviewDashboard
      operatorName={user.displayName}
      signOutHref={signOutPath("/")}
    />
  );
}
