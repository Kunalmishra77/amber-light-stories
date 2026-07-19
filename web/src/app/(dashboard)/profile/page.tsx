import { getMyMemberships, getProfile, getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ProfileForm, type ProfileData } from "./profile-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [user, profile, memberships] = await Promise.all([
    getSessionUser(),
    getProfile(),
    getMyMemberships(),
  ]);

  const data: ProfileData = {
    full_name: profile?.full_name ?? null,
    avatar: profile?.avatar ?? null,
    email: user?.email ?? "—",
    roles: memberships.map((m) => m.role),
  };

  return (
    <div>
      <PageHeader title="Profile" description="Your personal account details." />
      <ProfileForm profile={data} />
    </div>
  );
}
