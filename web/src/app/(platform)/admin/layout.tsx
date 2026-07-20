import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";

// Every /admin page reads live, cross-tenant data — never prerender.
export const dynamic = "force-dynamic";

/**
 * Defense-in-depth gate for the /admin tree. The parent platform layout
 * (`(platform)/layout.tsx`) already guards super-admin and provides the
 * platform shell/brand; this second check stays because server actions are
 * directly callable and don't re-run route layouts — and every admin server
 * action ALSO re-verifies via `requireSuperAdmin()`. Non-super-admins get a
 * 404 (not a redirect) so the portal's existence isn't disclosed.
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
