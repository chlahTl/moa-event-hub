import AdminDashboard from "./EventOperationsDashboard";
import { googleSignOutPath, requireGoogleUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireGoogleUser("/admin");
  return (
    <AdminDashboard
      adminName={user.displayName}
      adminEmail={user.email}
      signOutHref={googleSignOutPath("/")}
    />
  );
}
