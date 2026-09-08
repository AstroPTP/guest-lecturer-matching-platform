"use client";

import { useEffect, useState } from "react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import EventPageContent from "@/components/events/EventPageContent";

import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { DEMO_GUEST_LECTURER_ID } from "@/config/demoUsers";

import { getGuestLecturerProfile } from "@/services/profile/guestLecturerProfileService";

export default function GuestLecturerEventsPage() {
  const [currentUserName, setCurrentUserName] = useState("Guest Lecturer");

  const [currentUserRole, setCurrentUserRole] = useState("Guest Lecturer");

  const [currentUserOrganisation, setCurrentUserOrganisation] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const profile = await getGuestLecturerProfile();

        if (cancelled) {
          return;
        }

        if (profile) {
          setCurrentUserName(profile.basicInformation.fullName);

          setCurrentUserRole(profile.basicInformation.professionalRole);
          setCurrentUserOrganisation(profile.basicInformation.professionalField);
        }
      } catch {
        // TODO(API): No backend yet; keep showing the default display name/role.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardShell
      role="guestLecturer"
      
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-500">Loading events...</p>
        </div>
      ) : (
        <EventPageContent
          currentUserId={DEMO_GUEST_LECTURER_ID}
          currentUserType="guestLecturer"
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          currentUserOrganisation={currentUserOrganisation}
        />
      )}
    </DashboardShell>
  );
}
