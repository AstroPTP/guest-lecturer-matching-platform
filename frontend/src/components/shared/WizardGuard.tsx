"use client";

import type { ReactNode } from "react";
import BrandLogo from "@/components/brand/BrandLogo";
import FormSkeleton from "@/components/shared/FormSkeleton";
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
 *
 * The step is mounted straight away but kept hidden, so it loads its saved
 * draft while the status is still being checked rather than after.
 */
export default function WizardGuard({ roleRoot, children }: WizardGuardProps) {
  const status = useLeaveWizardIfCompleted(roleRoot);

  return (
    <>
      <div className="mx-auto mb-8 flex max-w-6xl justify-center">
        <BrandLogo variant="compact" size={36} />
      </div>
      {!status && <FormSkeleton />}
      <div hidden={!status || status.completed}>{children}</div>
    </>
  );
}
