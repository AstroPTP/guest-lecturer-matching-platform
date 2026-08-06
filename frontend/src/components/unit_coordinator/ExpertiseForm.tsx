"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import FormNavButtons from "@/components/shared/FormNavButtons";

import type { UnitCoordinatorExpertiseData } from "@/types/profile/unitCoordinatorProfileTypes";

import { getUnitCoordinatorExpertise, saveUnitCoordinatorExpertise } from "@/services/profile/unitCoordinatorProfileService";

import { experienceLevels, expertiseTopics } from "@/constants/profileOptions/shared";

export default function ExpertiseForm() {
  const router = useRouter();

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const [experienceLevelsRequired, setExperienceLevelsRequired] = useState<string[]>([]);

  const [industryRelevance, setIndustryRelevance] = useState("");
  const [learningObjective, setLearningObjective] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const data = await getUnitCoordinatorExpertise();

        if (cancelled || !data) {
          return;
        }

        setSelectedTopics(data.selectedTopics);

        setExperienceLevelsRequired(data.experienceLevelsRequired);

        setIndustryRelevance(data.industryRelevance);

        setLearningObjective(data.learningObjective);
      } catch {
        // TODO(API): No backend to load a saved draft from yet; continue with a blank form.
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
      alert("You can select up to 5 expertise topics.");
      return;
    }

    setSelectedTopics([...selectedTopics, topic]);
  }

  function handleExperienceLevelClick(level: string) {
    if (experienceLevelsRequired.includes(level)) {
      setExperienceLevelsRequired(experienceLevelsRequired.filter((selectedLevel) => selectedLevel !== level));
      return;
    }

    setExperienceLevelsRequired([...experienceLevelsRequired, level]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedTopics.length === 0) {
      alert("Please select at least one expertise topic.");
      return;
    }

    if (experienceLevelsRequired.length === 0) {
      alert("Please select at least one experience level.");
      return;
    }

    if (!industryRelevance.trim()) {
      alert("Please describe the discipline or industry relevance.");
      return;
    }

    if (!learningObjective.trim()) {
      alert("Please enter the learning objective.");
      return;
    }

    const expertiseData: UnitCoordinatorExpertiseData = {
      selectedTopics,
      experienceLevelsRequired,
      industryRelevance,
      learningObjective,
    };

    try {
      await saveUnitCoordinatorExpertise(expertiseData);
    } catch {
      alert("This isn't connected to a backend yet, so your changes couldn't be saved.");
      return;
    }

    router.push("/unit_coordinator/engagement");
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      {/* Progress */}
      <div className="mb-8 flex flex-col items-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">Step 2 of 4</p>

        <div className="flex gap-2">
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-[#2d2d2d]" />
          <div className="h-[3px] w-12 rounded-full bg-gray-300" />
          <div className="h-[3px] w-12 rounded-full bg-gray-300" />
        </div>
      </div>

      {/* Heading */}
      <div className="mb-12 text-center">
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-[#1f1f1f] md:text-5xl">Define your Guest Lecturer requirements</h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Tell us what expertise and professional experience you are looking for so we can match your teaching needs with suitable Guest Lecturers.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-10">
        {/* Expertise Topics */}
        <section>
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Expertise Topics</h2>

          <p className="mt-2 text-sm text-gray-500">Select up to 5 topics you would like a Guest Lecturer to address.</p>

          <div className="mt-5 flex flex-wrap gap-3">
            {expertiseTopics.map((topic) => {
              const isSelected = selectedTopics.includes(topic);

              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleTopicClick(topic)}
                  className={
                    "rounded-full px-5 py-3 text-sm font-semibold transition-colors " +
                    (isSelected ? "bg-[#242424] text-white" : "bg-[#e9e9e7] text-[#333333] hover:bg-gray-300")
                  }
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </section>

        {/* Experience Level Requirement */}
        <section>
          <h2 className="text-2xl font-bold text-[#1f1f1f]">Experience Level Requirement</h2>

          <p className="mt-2 text-sm text-gray-500">Select one or more acceptable professional experience levels for the Guest Lecturer.</p>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {experienceLevels.map((level) => {
              const isSelected = experienceLevelsRequired.includes(level.value);

              return (
                <button
                  key={level.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleExperienceLevelClick(level.value)}
                  className={
                    "min-h-32 rounded-2xl p-5 text-left transition-colors " +
                    (isSelected ? "bg-[#626976] text-white" : "bg-[#f0f0ee] text-[#1f1f1f] hover:bg-gray-200")
                  }
                >
                  <h3 className="font-bold leading-tight">{level.title}</h3>

                  <p className={"mt-2 text-sm leading-relaxed " + (isSelected ? "text-gray-100" : "text-gray-600")}>{level.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Industry relevance */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="industryRelevance" className="text-sm font-bold uppercase tracking-widest">
              Discipline / Industry Relevance
            </label>

            <span className="text-sm text-gray-500">{industryRelevance.length}/350</span>
          </div>

          <textarea
            id="industryRelevance"
            name="industryRelevance"
            rows={4}
            maxLength={350}
            required
            value={industryRelevance}
            onChange={(event) => setIndustryRelevance(event.target.value)}
            placeholder="Briefly describe the industry context or professional disciplines relevant to the Guest Lecturer session."
            className="w-full resize-none border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none focus:bg-white"
          />
        </section>

        {/* Learning objective */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="learningObjective" className="text-sm font-bold uppercase tracking-widest">
              Learning Objective
            </label>

            <span className="text-sm text-gray-500">{learningObjective.length}/350</span>
          </div>

          <textarea
            id="learningObjective"
            name="learningObjective"
            rows={4}
            maxLength={350}
            required
            value={learningObjective}
            onChange={(event) => setLearningObjective(event.target.value)}
            placeholder="Describe what students should understand or gain from the Guest Lecturer session."
            className="w-full resize-none border-0 border-b-2 border-black bg-gray-200 px-4 py-4 outline-none focus:bg-white"
          />
        </section>

        {/* Navigation */}
        <FormNavButtons submitLabel="Next" />
      </form>
    </main>
  );
}
