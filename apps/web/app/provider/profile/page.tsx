"use client";

import ProfileForm from "../../../components/profile/ProfileForm";
import PageHeader from "../../../components/ui/PageHeader";

export default function ProviderProfilePage() {
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Profile" />
      <div className="max-w-2xl">
        <ProfileForm />
      </div>
    </div>
  );
}
