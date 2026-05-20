import { notFound } from "next/navigation";
import { AdminPremiereTicketsPanel } from "@/components/storycam/AdminPremiereTicketsPanel";
import { isStoryCamAdmin } from "@/server/auth/admin";
import { requireUser, type AuthenticatedUser } from "@/server/auth/requireUser";

export default async function AdminPage() {
  const user = await getAdminPageUser();

  if (!user) {
    notFound();
  }

  return <AdminPremiereTicketsPanel adminEmail={user.email ?? "admin"} />;
}

async function getAdminPageUser(): Promise<AuthenticatedUser | null> {
  let user: AuthenticatedUser;

  try {
    user = await requireUser();
  } catch {
    return null;
  }

  if (!isStoryCamAdmin(user)) {
    return null;
  }

  return user;
}
