import { redirect } from "next/navigation";
import ProfileForm from "@/components/admin/ProfileForm";
import { readProfile, type Profile } from "@/lib/admin/settings";
import { AdminAuthError } from "@/lib/admin/client";

export default async function AdminProfilePage() {
  let profile: Profile;
  try {
    profile = await readProfile();
  } catch (e) {
    if (e instanceof AdminAuthError) redirect("/login");
    throw e;
  }
  return <ProfileForm profile={profile} />;
}
