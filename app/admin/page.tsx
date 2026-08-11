import AdminDashboard from "./EventOperationsDashboard";
import { requireAppUser, signOutPath } from "../auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAppUser("/admin");
  return (
    <AdminDashboard
      adminName={user.displayName}
      adminEmail={user.email}
      signOutHref={signOutPath("/")}
    />
  );
}
