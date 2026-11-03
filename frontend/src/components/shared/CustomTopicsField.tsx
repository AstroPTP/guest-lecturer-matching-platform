"use client";

import { KeyboardEvent, Ref, useId, useImperativeHandle, useState } from "react";
import {
  CUSTOM_TOPIC_MAX_LENGTH,
  CUSTOM_TOPIC_MIN_LENGTH,
  MAX_CUSTOM_TOPICS,
  MAX_TOPICS,
  customTopicError,
  isCustomTopic,
  tidyTopic,
} from "@/utils/customTopics";

export interface CustomTopicsFieldHandle {
  // Adds a topic left typed in the Other box as if Add had been clicked, and
  // returns the topics to save. Returns null, with the error shown, when the
  // typed topic is not valid.
  commitDraft: () => string[] | null;
}

interface CustomTopicsFieldProps {
  selectedTopics: string[];
  onChange: (topics: string[]) => void;
  compact?: boolean;
  // Stored topics that will not be saved, named in a notice above the field.
  droppedTopics?: string[];
  ref?: Ref<CustomTopicsFieldHandle>;
}

// The "Other" choice under the fixed topic chips. Custom topics are kept in the
// same list as the fixed ones, so they save and display the same way.
export default function CustomTopicsField({ selectedTopics, onChange, compact = false, droppedTopics = [], ref }: CustomTopicsFieldProps) {
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

  // Adds the typed topic and returns the new list, or shows why it cannot be
  // added and returns null.
  function addTopic(): string[] | null {
    const topic = tidyTopic(draft);
    const problem = customTopicError(topic, selectedTopics);
    setError(problem);
    if (problem) {
      return null;
    }
    const topics = [...selectedTopics, topic];
    onChange(topics);
    setDraft("");
    return topics;
  }

  useImperativeHandle(ref, () => ({
    // Text in a closed panel is out of sight, so it is not added.
    commitDraft: () => (isOpen && tidyTopic(draft) !== "" ? addTopic() : selectedTopics),
  }));

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
      {droppedTopics.length > 0 && (
        <p role="status" className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Saving will remove: {droppedTopics.join(", ")}. A profile can have up to {MAX_TOPICS} topics, with up to {MAX_CUSTOM_TOPICS} of your own.
        </p>
      )}
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
