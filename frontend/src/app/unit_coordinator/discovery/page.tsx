"use client";

import { useEffect, useState } from "react";

import DashboardShell from "@/components/dashboard/DashboardShell";
import DiscoveryPageContent from "@/components/discovery/DiscoveryPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { useDiscoverySort } from "@/lib/hooks/useDiscoverySort";
import { getPublicGuestLecturerProfiles } from "@/services/discovery/unitCoordinatorDiscoveryService";
import { getUnitCoordinatorProfile } from "@/services/profile/unitCoordinatorProfileService";
import type { DiscoveryItem } from "@/types/discovery/discoveryTypes";

export default function UnitCoordinatorDiscoveryPage() {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [currentUserName, setCurrentUserName] = useState("Unit Coordinator");
  const [currentUserPhoto, setCurrentUserPhoto] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Asked for from the server, so the order is the same one the API gives
  // everyone and no time or count about anyone reaches this page.
  const discoverySort = useDiscoverySort("unitCoordinator");

  useEffect(() => {
    let active = true;
    void getUnitCoordinatorProfile()
      .then((currentProfile) => {
        if (active && currentProfile) {
          setCurrentUserName(currentProfile.basicInformation.fullName);
          setCurrentUserPhoto(currentProfile.basicInformation.photoPreview);
        }
      })
      .catch((error: unknown) => console.error("Unable to load your profile:", error));
    return () => {
      active = false;
    };
  }, []);

  const { ready, sort } = discoverySort;
  useEffect(() => {
    if (!ready) {
      return;
    }
    let active = true;
    async function loadDiscovery() {
      setErrorMessage(null);
      try {
        const profiles = await getPublicGuestLecturerProfiles(sort);
        if (!active) {
          return;
        }
        const discoveryItems: DiscoveryItem[] = profiles.map((profile) => ({
          profileType: "guestLecturer",
          profile,
        }));
        setItems(discoveryItems);
      } catch (error) {
        if (!active) {
          return;
        }
        console.error("Unable to load guest lecturer profiles:", error);
        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadDiscovery();
    // A newer choice replaces this one, so a slow answer never lands after it.
    return () => {
      active = false;
    };
  }, [ready, sort]);
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
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
          sort={{ value: discoverySort.sort, options: discoverySort.options, onChange: discoverySort.choose }}
        />
      )}
    </DashboardShell>
  );
}
