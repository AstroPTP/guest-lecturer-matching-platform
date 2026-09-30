"use client";

import type { ReactNode } from "react";
import { useLeaveWizardIfCompleted } from "@/lib/hooks/useOnboardingStatus";

interface WizardGuardProps {
  /** The dashboard's route root, e.g. "/guest_lecturer". */
  roleRoot: string;
  children: ReactNode;
}

/**
 * Wraps a setup wizard step. Shows it only once the caller is known not to
 * have finished the wizard; a caller who has is sent to the dashboard instead,
 * without the step flashing up first.
 */
export default function WizardGuard({ roleRoot, children }: WizardGuardProps) {
  const status = useLeaveWizardIfCompleted(roleRoot);

  if (!status || status.completed) {
    return null;
  }
  return <>{children}</>;
}
