import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";

// Every /admin page reads live, cross-tenant data — never prerender.
export const dynamic = "force-dynamic";

/**
 * Hard gate for the entire /admin tree. Non-super-admins get a 404 (not a
 * redirect) so the portal's existence isn't even disclosed. Every admin
 * server action ALSO re-verifies via `requireSuperAdmin()` — this layout
 * check alone is not sufficient, since server actions are directly
 * callable and don't re-run route layouts.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getProfile();
  if (!profile?.is_super_admin) {
    notFound();
  }

  return <>{children}</>;
}
