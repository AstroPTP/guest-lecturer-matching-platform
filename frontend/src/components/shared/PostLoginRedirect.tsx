"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStatus } from "@/lib/hooks/useOnboardingStatus";

interface PostLoginRedirectProps {
  /** The dashboard's route root, e.g. "/guest_lecturer". */
  roleRoot: string;
}

/**
 * Where sign-in lands. Sends a user who has finished the setup wizard to the
 * dashboard, and everyone else to its first step.
 *
 * Any failure, including "no profile yet", falls back to the wizard, which is
 * where every sign-in used to go: it pre-fills saved answers, so a returning
 * user sent there by mistake loses nothing.
 */
export default function PostLoginRedirect({ roleRoot }: PostLoginRedirectProps) {
  const status = useOnboardingStatus();
  const router = useRouter();

  useEffect(() => {
    if (status) {
      router.replace(status.completed ? roleRoot + "/my_profile" : roleRoot + "/profile");
    }
  }, [status, roleRoot, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 px-4">
      <p className="text-gray-600">Signing you in…</p>
    </main>
  );
}
