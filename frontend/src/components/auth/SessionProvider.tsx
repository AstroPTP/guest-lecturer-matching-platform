"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isAppRole, toAccountRole, toUserRole } from "@/lib/auth/roles";
import type { AccountRole, AppRole } from "@/lib/auth/roles";
import type { UserRole } from "@/types/shared/userRole";

export interface CurrentUser {
  /** The `sub` claim — the Auth0 user id. */
  id: string;
  email: string;
  fullName: string;
  /** Roles from the verified token. Empty until an administrator grants one. */
  roles: AppRole[];
  /** Which dashboard to show, or null when no role has been granted. */
  accountRole: AccountRole | null;
  userRole: UserRole | null;
}

interface SessionState {
  user: CurrentUser | null;
  /** True until the first session lookup resolves. */
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  user: null,
  isLoading: true,
  refresh: async () => {},
});

interface SessionResponse {
  user: { id: string; email: string; name: string; roles: string[] } | null;
}

/**
 * Makes the signed-in user available to client components.
 *
 * The session is fetched from /api/auth/session, which reads the HttpOnly
 * cookie server-side and returns claims only — never the access token.
 *
 * Nothing here is an authorisation check. Hiding a control with this is a UI
 * convenience; the backend verifies the token's signature and re-reads the
 * roles on every request, and refuses regardless of what the browser decided.
 */
/**
 * Fetches the session and shapes it. Deliberately returns the user rather than
 * setting state, so the effect below can set state inside the promise callback
 * — which is the pattern React's set-state-in-effect rule asks for.
 */
async function loadSession(): Promise<CurrentUser | null> {
  try {
    const response = await fetch("/api/auth/session", { credentials: "same-origin" });
    const body = (await response.json()) as SessionResponse;

    if (!body.user) {
      return null;
    }

    const roles = body.user.roles.filter(isAppRole);
    const accountRole = toAccountRole(roles);

    return {
      id: body.user.id,
      email: body.user.email,
      fullName: body.user.name || body.user.email.split("@")[0],
      roles,
      accountRole,
      userRole: accountRole ? toUserRole(accountRole) : null,
    };
  } catch {
    // An unreachable session endpoint should render the app signed-out, not
    // crash it.
    return null;
  }
}

/**
 * Makes the signed-in user available to client components.
 *
 * The session comes from /api/auth/session, which reads the HttpOnly cookie
 * server-side and returns claims only — never the access token.
 *
 * Nothing here is an authorisation check. Hiding a control with this is a UI
 * convenience; the backend verifies the token's signature and re-reads the
 * roles on every request, and refuses regardless of what the browser decided.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void loadSession().then((loaded) => {
      if (active) {
        setUser(loaded);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  /** Re-reads the session. Called after signing in, before navigating. */
  const refresh = useCallback(async () => {
    setUser(await loadSession());
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, refresh }),
    [user, isLoading, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * The signed-in user, or null.
 *
 * Check `isLoading` before treating a null user as signed out — on first
 * render the session has not been fetched yet, and redirecting on that would
 * bounce a signed-in user to /login on every page load.
 */
export function useCurrentUser(): SessionState {
  return useContext(SessionContext);
}
