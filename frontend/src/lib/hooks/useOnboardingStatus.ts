"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/api/backendClient";

export interface OnboardingStatus {
  /** The caller has finished the setup wizard (saved the consent step). */
  completed: boolean;
}

/**
 * Where the signed-in caller is in onboarding, or null while that is still
 * being checked.
 *
 * Asks the backend rather than guessing from anything client-side. The
 * backend creates the caller's user row on first sight, so a new account is
 * simply "not completed". An error is treated the same way, so a network
 * hiccup sends the caller to the wizard, which pre-fills saved answers,
 * rather than skipping them past it.
 */
export function useOnboardingStatus(): OnboardingStatus | null {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    let active = true;

    backendFetch<{ profileCompleted?: boolean }>("/users/me")
      .then((me) => me.profileCompleted === true)
      .catch(() => false)
      .then((completed) => {
        if (active) setStatus({ completed });
      });

    return () => {
      active = false;
    };
  }, []);

  return status;
}

/**
 * For the setup wizard's pages: sends a caller who has already finished it to
 * the dashboard, so a bookmark or a typed URL does not walk them through it
 * again. Returns the status, which stays null while it is being checked.
 */
export function useLeaveWizardIfCompleted(roleRoot: string): OnboardingStatus | null {
  const status = useOnboardingStatus();
  const router = useRouter();

  useEffect(() => {
    if (status?.completed) {
      router.replace(roleRoot + "/my_profile");
    }
  }, [status, roleRoot, router]);

  return status;
}
