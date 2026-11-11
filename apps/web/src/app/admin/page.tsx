import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { ApiUnavailable } from "@/components/api-unavailable";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminPage() {
  const session = await getSession();
  if (session.status === "api-unavailable") return <ApiUnavailable />;
  if (session.status === "signed-out") redirect("/login");
  // The api enforces this on every call too; this just avoids showing a broken page.
  if (session.user.role !== "ADMIN") redirect("/");

  const { appName } = await getBranding();
  return <AdminShell appName={appName} currentUserId={session.user.id} />;
}
