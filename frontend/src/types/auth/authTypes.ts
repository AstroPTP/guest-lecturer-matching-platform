export type AccountRole = "guest" | "coordinator" | "admin";

/**
 * Role strings as they appear in the access token's namespaced claim
 * (https://glmp.curtin.edu.au/roles, SAS §2.5.2 Interface 5).
 *
 * These must stay identical to AppRole in backend/src/auth/roles.ts and to the
 * values stored in each Auth0 user's app_metadata. Three places, one
 * vocabulary — change one and all three have to change.
 */
export type AppRole = "guest_speaker" | "unit_coordinator" | "ccae_admin";

export interface RegisteredAccount {
  /** Auth0 user id — the `sub` claim. */
  id: string;
  fullName: string;
  email: string;
  role: AccountRole;
  emailVerified: boolean;
  createdAt: string;
}

export type AuthenticationResult =
  | {
      success: true;
      account: RegisteredAccount;
    }
  | {
      success: false;
      error: string;
      reason?: "account_not_found" | "incorrect_password" | "email_not_verified" | "email_already_registered";
    };
