import AdminDashboard from "./EventOperationsDashboard";
import {
  chatGPTSignOutPath,
  isAdminUser,
  requireChatGPTUser,
} from "../chatgpt-auth";
import AdminAccessDenied from "./AdminAccessDenied";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");

  if (!isAdminUser(user)) {
    return (
      <AdminAccessDenied
        email={user.email}
        signOutHref={chatGPTSignOutPath("/")}
      />
    );
  }

  return (
    <AdminDashboard
      adminName={user.displayName}
      adminEmail={user.email}
      signOutHref={chatGPTSignOutPath("/")}
    />
  );
}
