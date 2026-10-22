"use client";

import { KeyboardEvent, useId, useState } from "react";
import {
  CUSTOM_TOPIC_MAX_LENGTH,
  CUSTOM_TOPIC_MIN_LENGTH,
  MAX_CUSTOM_TOPICS,
  customTopicError,
  isCustomTopic,
  tidyTopic,
} from "@/utils/customTopics";

interface CustomTopicsFieldProps {
  selectedTopics: string[];
  onChange: (topics: string[]) => void;
  compact?: boolean;
}

// The "Other" choice under the fixed topic chips. Custom topics are kept in the
// same list as the fixed ones, so they save and display the same way.
export default function CustomTopicsField({ selectedTopics, onChange, compact = false }: CustomTopicsFieldProps) {
  const customTopics = selectedTopics.filter(isCustomTopic);
  const [isOpen, setIsOpen] = useState(customTopics.length > 0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const panelId = inputId + "-panel";
  const hintId = inputId + "-hint";
  const errorId = inputId + "-error";

  const chipClass = "rounded-full text-sm font-semibold transition-colors " + (compact ? "px-4 py-2" : "px-5 py-3");
  const selectedClass = compact ? "bg-[#2d2d2d] text-white" : "bg-black text-white";
  const idleClass = (compact ? "bg-gray-200 text-gray-700" : "bg-gray-200 text-black") + " hover:bg-gray-300";

  function addTopic() {
    const topic = tidyTopic(draft);
    const problem = customTopicError(topic, selectedTopics);
    setError(problem);
    if (problem) {
      return;
    }
    onChange([...selectedTopics, topic]);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the topic instead of submitting the surrounding form.
    if (event.key === "Enter") {
      event.preventDefault();
      addTopic();
    }
  }

  function removeTopic(topic: string) {
    onChange(selectedTopics.filter((selected) => selected !== topic));
    setError("");
  }

  return (
    <div className="mt-3">
      <div className={"flex flex-wrap " + (compact ? "gap-2" : "gap-3")}>
        {customTopics.map((topic) => (
          <span key={topic} className={chipClass + " inline-flex items-center gap-2 " + selectedClass}>
            {topic}
            <button
              type="button"
              onClick={() => removeTopic(topic)}
              aria-label={"Remove " + topic}
              className="-mr-1 rounded-full px-1 leading-none text-gray-300 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen(!isOpen)}
          className={chipClass + " " + (isOpen ? selectedClass : idleClass)}
        >
          Other
        </button>
      </div>

      {isOpen && (
        <div id={panelId} className="mt-4">
          <label htmlFor={inputId} className="mb-2 block font-semibold text-[#1f1f1f]">
            Add a topic that is not listed
          </label>
          <div className="flex gap-3">
            <input
              id={inputId}
              type="text"
              value={draft}
              maxLength={CUSTOM_TOPIC_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Supply Chain Management"
              aria-invalid={error !== ""}
              aria-describedby={hintId + (error ? " " + errorId : "")}
              className={
                "min-w-0 flex-1 border-0 border-b-2 border-black px-4 py-3 outline-none focus:bg-white " + (compact ? "bg-gray-100" : "bg-[#e9e9e7]")
              }
            />
            <button type="button" onClick={addTopic} className="shrink-0 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-[#2d2d2d]">
              Add
            </button>
          </div>
          <p id={hintId} className="mt-2 text-sm text-gray-500">
            {customTopics.length} of {MAX_CUSTOM_TOPICS} added. Use {CUSTOM_TOPIC_MIN_LENGTH} to {CUSTOM_TOPIC_MAX_LENGTH} characters: letters, numbers,
            spaces and &amp; - / &apos; . only.
          </p>
          {error && (
            <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
