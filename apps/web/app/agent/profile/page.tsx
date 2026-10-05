"use client";

import ProfileForm from "../../../components/profile/ProfileForm";
import PageHeader from "../../../components/ui/PageHeader";

export default function AgentProfilePage() {
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Profile" description="Your name and how you appear across the workspace." />
      <div className="max-w-2xl">
        <ProfileForm />
      </div>
    </div>
  );
}
