"use client";

import PageHeader from "../../../components/ui/PageHeader";
import ProfileForm from "../../../components/profile/ProfileForm";

export default function AdminProfilePage() {
  return (
    <div>
      <PageHeader title="Profile" description="Your name and how you appear across the workspace." />
      <div className="max-w-2xl">
        <ProfileForm />
      </div>
    </div>
  );
}
