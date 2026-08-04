export type AccountRole = "guest" | "coordinator";

export interface RegisteredAccount {
  id: string;
  fullName: string;
  email: string;
  password: string;
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
