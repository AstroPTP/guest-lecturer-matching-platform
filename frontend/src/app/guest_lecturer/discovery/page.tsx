"use client";

import { useEffect, useState } from "react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import DiscoveryPageContent from "@/components/discovery/DiscoveryPageContent";

import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { DEMO_GUEST_LECTURER_ID } from "@/config/demoUsers";

import { getPublicUnitCoordinatorProfiles } from "@/services/discovery/guestLecturerDiscoveryService";

import { getGuestLecturerProfile } from "@/services/profile/guestLecturerProfileService";

import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";

export default function GuestLecturerDiscoveryPage() {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [currentUserName, setCurrentUserName] = useState("Guest Lecturer");
  const [currentUserPhoto, setCurrentUserPhoto] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiscovery() {
      setErrorMessage(null);

      try {
        const currentProfile = await getGuestLecturerProfile();

        if (currentProfile) {
          setCurrentUserName(currentProfile.basicInformation.fullName);
          setCurrentUserPhoto(currentProfile.basicInformation.photoPreview);
        }

        const profiles = await getPublicUnitCoordinatorProfiles();

        const discoveryItems: DiscoveryItem[] = profiles.map((profile) => ({profileType: "unitCoordinator", profile}));

        setItems(discoveryItems);
      } catch (error) {
        console.error("Unable to load unit coordinator profiles:", error);

        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDiscovery();
  }, []);

  return (
    <DashboardShell
      role="guestLecturer"
      currentUserId={DEMO_GUEST_LECTURER_ID}
      menuItems={guestLecturerMenu}
      notificationHref="/guest_lecturer/notifications"
      messagesHref="/guest_lecturer/messages"
      profileHref="/guest_lecturer/my_profile"
    >
      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-500">Loading opportunities...</p>
        </div>
      ) : errorMessage ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-center text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <DiscoveryPageContent
          initialItems={items}
          title="Discover Opportunities"
          description="Review unit coordinator requirements that may match your expertise and availability."
          currentUserId={DEMO_GUEST_LECTURER_ID}
          currentUserType="guestLecturer"
          currentUserName={currentUserName}
          currentUserPhoto={currentUserPhoto}
          messagesHref="/guest_lecturer/messages"
          filterHref="/guest_lecturer/filter"
        />
      )}
    </DashboardShell>
  );
}
