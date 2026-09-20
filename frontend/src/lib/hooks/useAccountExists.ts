"use client";

import { useEffect, useState } from "react";
import { backendFetch, BackendError } from "@/lib/api/backendClient";

/**
 * Whether the signed-in caller already has a user row, or null while that is
 * still being checked.
 *
 * Distinguishes a first login from a returning one by asking the backend,
 * rather than guessing from anything client-side. An error other than "no
 * profile yet" is treated as exists, so an unrelated network hiccup does not
 * block someone who already has an account.
 */
export function useAccountExists(): boolean | null {
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    backendFetch("/users/me")
      .then(() => {
        if (active) setExists(true);
      })
      .catch((error) => {
        if (!active) return;
        const notFound =
          error instanceof BackendError && error.code === "USER_PROFILE_NOT_FOUND";
        setExists(!notFound);
      });

    return () => {
      active = false;
    };
  }, []);

  return exists;
}
