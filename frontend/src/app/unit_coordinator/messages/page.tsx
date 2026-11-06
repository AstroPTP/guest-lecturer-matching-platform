"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import MessagesPageContent from "@/components/messages/MessagesPageContent";
import { unitCoordinatorMenu } from "@/config/unitCoordinatorDashboard";
import { BackendError } from "@/lib/api/backendClient";
import { getMatchedProfiles } from "@/services/matches/matchedProfileService";
import type { ConversationSeed } from "@/types/messages/messageTypes";
import { formatOptions } from "@/constants/profileOptions/shared";
import { formatOptionLabel, formatStoredValue } from "@/utils/displayFormatters";

export default function UnitCoordinatorMessagesPage() {
  const [conversationSeeds, setConversationSeeds] = useState<ConversationSeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversations() {
      setErrorMessage(null);
      try {
        const matches = await getMatchedProfiles( "unitCoordinator");
        const nextSeeds: ConversationSeed[] = [];
        for (const item of matches) {
          if (item.profileType !== "guestLecturer") {
            continue;
          }

          const { basicInformation, engagementProfile } = item.profile;

          nextSeeds.push({
            participant: {
              id: item.profile.id,
              fullName: basicInformation.fullName,
              roleLabel: basicInformation.professionalRole,
              organisation: basicInformation.professionalField,
              photoPreview: basicInformation.photoPreview,
              online: true,
            },

            matchedUnit: {
            location: engagementProfile.primaryLocation,
            format:
              (engagementProfile.formats ?? engagementProfile.format.split(","))
                .map((value) => formatOptionLabel(value.trim(), formatOptions))
                .filter(Boolean)
                .join(", ") || "Not specified",
            duration: formatStoredValue(engagementProfile.sessionDuration) || "Not specified",
            semester: "Sem 2",
            },
          });
        }

        setConversationSeeds(nextSeeds);
      } catch (error) {
        if (error instanceof BackendError && error.status === 403) {
          // An account with no profile yet has no matches, and the API will
          // not list them. It can still hear from CCAE, so the page opens with
          // no matched conversations rather than with an error.
          setConversationSeeds([]);
        } else {
          console.error("Unable to load conversations:", error);
          setErrorMessage("Unable to load data. Please try again.");
        }
      } finally {
        setIsLoading(false);
      }
    }
    void loadConversations();
  }, []);
  return (
    <DashboardShell
      role="unitCoordinator"
      menuItems={unitCoordinatorMenu}
      notificationHref="/unit_coordinator/notifications"
    >
      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-500">Loading messages...</p>
        </div>
      ) : errorMessage ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-center text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <MessagesPageContent
          userType="unitCoordinator"
          conversationSeeds={conversationSeeds}
          participantProfileHref="/unit_coordinator/matches"
        />
      )}
    </DashboardShell>
  );
}
