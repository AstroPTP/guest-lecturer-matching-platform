"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FormSkeleton from "@/components/shared/FormSkeleton";
import FormNavButtons from "@/components/shared/FormNavButtons";
import { getGuestLecturerExpertise, saveGuestLecturerExpertise } from "@/services/profile/guestLecturerProfileService";
import { experienceLevels, expertiseTopics } from "@/constants/profileOptions/shared";
import CustomTopicsField from "@/components/shared/CustomTopicsField";
import { cleanStoredTopics } from "@/utils/customTopics";
export default function ExpertiseForm() {
  const router = useRouter();
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState("");
  const [hasSpeakingExperience, setHasSpeakingExperience] = useState(false);
  const [speakingDetails, setSpeakingDetails] = useState("");
  const [hasInternationalExperience, setHasInternationalExperience] = useState(false);
  const [internationalDetails, setInternationalDetails] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const data = await getGuestLecturerExpertise();
        if (cancelled || !data) {
          return;
        }
        setSelectedTopics(cleanStoredTopics(data.selectedTopics));
        setExperienceLevel(data.experienceLevel);
        setHasSpeakingExperience(data.hasSpeakingExperience);
        setSpeakingDetails(data.speakingDetails);
        setHasInternationalExperience(data.hasInternationalExperience);
        setInternationalDetails(data.internationalDetails);
        setLinkedin(data.linkedin);
      } catch {
      } finally {
        if (!cancelled) {
          setIsLoadingDraft(false);
        }
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, []);
  function handleTopicClick(topic: string) {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter((selectedTopic) => selectedTopic !== topic));
      return;
    }
    if (selectedTopics.length >= 5) {
      alert("You can select up to 5 topics.");
      return;
    }
    setSelectedTopics([...selectedTopics, topic]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedTopics.length === 0) {
      alert("Please select at least one expertise topic.");
      return;
    }

    if (!experienceLevel) {
      alert("Please select your experience level.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await saveGuestLecturerExpertise({
        selectedTopics,
        experienceLevel,
        hasSpeakingExperience,
        speakingDetails: hasSpeakingExperience ? speakingDetails : "",
        hasInternationalExperience,
        internationalDetails: hasInternationalExperience ? internationalDetails : "",
        linkedin,
      });
      router.push("/guest_lecturer/engagement");
    } catch {
      setError("Could not save your information. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }
  // Wait for the saved draft before showing the form. Otherwise anything
  // typed while it loads is overwritten when it arrives.
  if (isLoadingDraft) {
    return <FormSkeleton />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Step 2 of 4</p>
        <div className="flex gap-2">
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-gray-300" />
          <div className="h-[3px] w-12 rounded-full bg-gray-300" />
        </div>
      </div>

      <div className="mb-12 text-center">
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">What can you speak about?</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Define your areas of business and legal expertise to help us match you with the right speaking engagements in the Faculty of Business and Law.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Expertise Topics</h2>

          <p className="mt-2 text-sm text-gray-500">
            Select one or more topics (up to 5) that you feel confident presenting on within the Faculty of Business and Law. Choose Other to add up
            to 3 of your own.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {expertiseTopics.map((topic) => {
              const isSelected = selectedTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleTopicClick(topic)}
                  className={
                    "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                    (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                  }
                >
                  {topic}
                </button>
              );
            })}
          </div>
          <CustomTopicsField selectedTopics={selectedTopics} onChange={setSelectedTopics} />
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Experience Level</h2>
          <p className="mt-2 text-sm text-gray-500">Where would you place yourself in your industry career?</p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {experienceLevels.map((level) => {
              const isSelected = experienceLevel === level.value;
              return (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setExperienceLevel(level.value)}
                  className={
                    "min-h-32 rounded-2xl p-5 text-left transition-colors " +
                    (isSelected ? "bg-black text-white" : "bg-gray-200 text-black hover:bg-gray-300")
                  }
                >
                  <h3 className="font-bold leading-tight">{level.title}</h3>

                  <p className={"mt-2 text-sm leading-relaxed " + (isSelected ? "text-gray-300" : "text-gray-600")}>{level.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Prior Speaking Engagements</h2>

          <div className="mt-7 flex items-start justify-between gap-6">
            <div>
              <h3 className="font-semibold text-[#1f1f1f]">Have you undertaken any public speaking engagements previously?</h3>

              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                For example, keynote addresses, conference presentations, panel discussions, or media commentary.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setHasSpeakingExperience(!hasSpeakingExperience)}
              className={"relative h-8 w-14 shrink-0 rounded-full transition-colors duration-300 " + (hasSpeakingExperience ? "bg-black" : "bg-gray-300")}
            >
              <span
                className={
                  "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 " +
                  (hasSpeakingExperience ? "translate-x-6" : "translate-x-0")
                }
              />
            </button>
          </div>

          {hasSpeakingExperience && (
            <div className="mt-7">
              <label htmlFor="speakingDetails" className="mb-2 block font-semibold text-[#1f1f1f]">
                Please provide details of one prior speaking engagement (e.g., conference, seminar, or industry panel).
              </label>

              <input
                id="speakingDetails"
                name="speakingDetails"
                type="text"
                value={speakingDetails}
                onChange={(event) => setSpeakingDetails(event.target.value)}
                placeholder="e.g., Panelist, WA Legal Innovation Summit, 2024"
                required={hasSpeakingExperience}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <h2 className="text-2xl font-bold text-[#1f1f1f]">International Experience</h2>

          <div className="mt-7 flex items-start justify-between gap-6">
            <div>
              <h3 className="font-semibold text-[#1f1f1f]">Have you worked or practised internationally?</h3>

              <p className="mt-1 max-w-2xl text-sm text-gray-500">Worked, practised law, consulted, or presented outside Australia.</p>
            </div>

            <button
              type="button"
              onClick={() => setHasInternationalExperience(!hasInternationalExperience)}
              className={
                "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-300 " + (hasInternationalExperience ? "bg-black" : "bg-gray-300")
              }
            >
              <span
                className={
                  "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 " +
                  (hasInternationalExperience ? "translate-x-6" : "translate-x-0")
                }
              />
            </button>
          </div>

          {hasInternationalExperience && (
            <div className="mt-7">
              <input
                type="text"
                value={internationalDetails}
                onChange={(event) => setInternationalDetails(event.target.value)}
                placeholder="e.g., Singapore, United Kingdom"
                required={hasInternationalExperience}
                className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
              />
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-sm md:p-10">
          <label htmlFor="linkedin" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#2d2d2d]">
            LinkedIn Profile
          </label>

          <input
            id="linkedin"
            name="linkedin"
            type="url"
            value={linkedin}
            onChange={(event) => setLinkedin(event.target.value)}
            placeholder="https://linkedin.com/in/your-profile"
            className="w-full border-0 border-b-2 border-black bg-[#e9e9e7] px-4 py-4 outline-none focus:bg-white"
          />
          <p className="mt-2 text-sm text-gray-500">Optional, but highly recommended for verification.</p>
        </section>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        <FormNavButtons submitLabel={isSaving ? "Saving..." : "Next"} />
      </form>
    </main>
  );
}