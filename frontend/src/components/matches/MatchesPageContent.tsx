"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import infoIcon from "@/assets/info.png";
import MatchCard from "./MatchCard";
import MatchedProfileView from "./MatchedProfileView";
import { getMatchedProfiles } from "@/services/matches/matchedProfileService";
import type { MatchedProfile } from "@/types/matches/matchedProfileTypes";
import type { UserRole } from "@/types/shared/userRole";

interface MatchesPageContentProps {
  currentUserType: UserRole;
  title: string;
  description: string;
  messagesHref: string;
}

export default function MatchesPageContent({ currentUserType, title, description, messagesHref }: MatchesPageContentProps) {
  const router = useRouter();
  const [matchedProfiles, setMatchedProfiles] = useState<MatchedProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<MatchedProfile | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadMatches() {
      setErrorMessage(null);
      try {
        const profiles = await getMatchedProfiles(currentUserType);

        setMatchedProfiles(profiles);
      } catch (error) {
        console.error("Unable to load matched profiles:", error);
        setErrorMessage("Unable to load data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadMatches();
  }, [currentUserType]);
  const filteredProfiles = matchedProfiles.filter((item) => {
    const searchableText = [item.profile.basicInformation.fullName, ...item.profile.expertise.selectedTopics].join(" ").toLowerCase();
    return searchableText.includes(search.trim().toLowerCase());
  });

  function handleChat(item: MatchedProfile) {
    router.push(messagesHref + "?userId=" + encodeURIComponent(item.profile.id));
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading matches...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-center text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (selectedProfile) {
    return <MatchedProfileView item={selectedProfile} onBack={() => setSelectedProfile(null)} onChat={() => handleChat(selectedProfile)} />;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2d2d2d] md:text-4xl">{title}</h1>

            <p className="mt-3 max-w-2xl leading-7 text-gray-600">{description}</p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search matches..."
            className="w-full border-0 border-b border-[#2d2d2d] bg-gray-200 px-4 py-3 outline-none md:w-72"
          />
        </div>

        {filteredProfiles.length > 0 ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_260px] gap-6 border-b-2 border-gray-200 px-6 pb-4 text-xs font-bold uppercase tracking-[0.12em] text-gray-600 lg:grid">
              <p>Matched Profile</p>
              <p>Expertise Topics</p>
              <p className="text-right">Actions</p>
            </div>
            <div className="mt-5 space-y-5">
              {filteredProfiles.map((item) => (
                <MatchCard key={item.match.id} item={item} onViewProfile={() => setSelectedProfile(item)} onChat={() => handleChat(item)} />
              ))}
            </div>
          </>
        ) : (
          <EmptyMatches hasSearch={search.trim().length > 0} />
        )}
      </div>
    </>
  );
}

function EmptyMatches({ hasSearch }: { hasSearch: boolean }) {
  return (
    <section className="rounded-2xl bg-white px-6 py-20 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
        <Image src={infoIcon} alt="" width={28} height={28} />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-[#2d2d2d]">{hasSearch ? "No matching results" : "No matches yet"}</h2>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-gray-500">
        {hasSearch ? "No matched profiles correspond to your search." : "When both users express interest, the matched profile will appear here."}
      </p>
    </section>
  );
}
