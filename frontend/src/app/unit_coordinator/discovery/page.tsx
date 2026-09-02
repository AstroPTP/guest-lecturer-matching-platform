"use client";

import { useEffect, useState } from "react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import DiscoveryPageContent from "@/components/discovery/DiscoveryPageContent";

import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";

import { getPublicGuestLecturerProfiles } from "@/services/discovery/unitCoordinatorDiscoveryService";

import { getUnitCoordinatorProfile } from "@/services/profile/unitCoordinatorProfileService";

import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";

export default function UnitCoordinatorDiscoveryPage() {
  const [items, setItems] = useState<DiscoveryItem[]>([]);

  const [currentUserName, setCurrentUserName] = useState("Unit Coordinator");

  const [currentUserPhoto, setCurrentUserPhoto] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiscovery() {
      setErrorMessage(null);

      try {
        const currentProfile = await getUnitCoordinatorProfile();

        if (currentProfile) {
          setCurrentUserName(currentProfile.basicInformation.fullName);

          setCurrentUserPhoto(currentProfile.basicInformation.photoPreview);
        }

        const profiles = await getPublicGuestLecturerProfiles();

        const discoveryItems: DiscoveryItem[] = profiles.map((profile) => ({
          profileType: "guestLecturer",
          profile,
        }));

        setItems(discoveryItems);
      } catch (error) {
        console.error("Unable to load guest lecturer profiles:", error);

        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDiscovery();
  }, []);

  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
      messagesHref="/unit_coordinator/messages"
      profileHref="/unit_coordinator/my_profile"
    >
      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-500">Loading guest lecturers...</p>
        </div>
      ) : errorMessage ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-center text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <DiscoveryPageContent
          initialItems={items}
          title="Discover Guest Lecturers"
          description="Review guest lecturers who may match your unit requirements."
          currentUserType="unitCoordinator"
          currentUserName={currentUserName}
          currentUserPhoto={currentUserPhoto}
          messagesHref="/unit_coordinator/messages"
          filterHref="/unit_coordinator/filter"
        />
      )}
    </DashboardShell>
  );
}
