"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import MessagesPageContent from "@/components/messages/MessagesPageContent";
import { guestLecturerMenu } from "@/config/guestLecturerDashboard";
import { getMatchedProfiles } from "@/services/matches/matchedProfileService";
import type { ConversationSeed } from "@/types/messages/messageTypes";
import { formatStoredValue } from "@/utils/displayFormatters";

export default function GuestLecturerMessagesPage() {
  const [conversationSeeds, setConversationSeeds] = useState<ConversationSeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversations() {
      setErrorMessage(null);
      try {
        const matches = await getMatchedProfiles("guestLecturer");
        const nextSeeds: ConversationSeed[] = [];

        for (const item of matches) {
          if (item.profileType !== "unitCoordinator") {
            continue;
          }

          const { basicInformation, engagementProfile } = item.profile;
          nextSeeds.push({
            participant: {
              id: item.profile.id,
              fullName: basicInformation.fullName,
              roleLabel: formatStoredValue(basicInformation.academicRole) || "Not specified",
              organisation: formatStoredValue(basicInformation.schoolDepartment) || "Not specified",
              photoPreview: basicInformation.photoPreview,
              online: true,
            },

            matchedUnit: {
              location: engagementProfile.primaryLocation,
              format: engagementProfile.formats[0] ? formatStoredValue(engagementProfile.formats[0]) : "Flexible",
              duration: formatStoredValue(engagementProfile.sessionDuration) || "Not specified",
              semester: "Sem 2",
            },
          });
        }

        setConversationSeeds(nextSeeds);
      } catch (error) {
        console.error("Unable to load conversations:", error);
        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadConversations();
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
          <p className="text-gray-500">Loading messages...</p>
        </div>
      ) : errorMessage ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-center text-red-700">{errorMessage}</p>
        </div>
      ) : (
        <MessagesPageContent
          userType="guestLecturer"
          conversationSeeds={conversationSeeds}
          participantProfileHref="/guest_lecturer/matches"
        />
      )}
    </DashboardShell>
  );
}
