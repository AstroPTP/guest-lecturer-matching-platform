"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EventPageContent from "@/components/events/EventPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { getUnitCoordinatorProfile } from "@/services/profile/unitCoordinatorProfileService";
import { getMatchedProfiles } from "@/services/matches/matchedProfileService";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import { formatStoredValue } from "@/utils/displayFormatters";

export default function UnitCoordinatorEventsPage() {
  const [currentUserName, setCurrentUserName] = useState("Unit Coordinator");
  const [currentUserRole, setCurrentUserRole] = useState("Unit Coordinator");
  const [currentUserOrganisation, setCurrentUserOrganisation] = useState("");
  const [matchedGuestLecturers, setMatchedGuestLecturers] = useState<MatchedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPage() {
      setErrorMessage(null);
      try {
        const profile = await getUnitCoordinatorProfile();
        if (profile) {
          setCurrentUserName(profile.basicInformation.fullName);
          setCurrentUserRole(formatStoredValue(profile.basicInformation.academicRole));
          setCurrentUserOrganisation(formatStoredValue(profile.basicInformation.schoolDepartment));
        }

        const matches = await getMatchedProfiles( "unitCoordinator");
        setMatchedGuestLecturers(matches.filter((item) => item.profileType === "guestLecturer"));
      } catch (error) {
        console.error("Unable to load events page:", error);
        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
    loadPage();
  }, []);
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-500">Loading events...</p>
        </div>
      ) : errorMessage ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-center text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <EventPageContent
          currentUserType="unitCoordinator"
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          currentUserOrganisation={currentUserOrganisation}
          matchedGuestLecturers={matchedGuestLecturers}
        />
      )}
    </DashboardShell>
  );
}
