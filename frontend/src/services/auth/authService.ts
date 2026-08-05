import type { AccountRole, AuthenticationResult, RegisteredAccount } from "@/types/auth/authTypes";


const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";


export async function registerAccount(_params: {
  fullName: string;
  email: string;
  password: string;
  role: AccountRole;
}): Promise<AuthenticationResult> {
  return {
    success: false,
    error: NOT_INTEGRATED_MESSAGE,
  };
}

export async function verifyRegisteredAccount(_code: string): Promise<boolean> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function authenticateAccount(_email: string, _password: string): Promise<AuthenticationResult> {
  return {
    success: false,
    error: NOT_INTEGRATED_MESSAGE,
  };
}

export async function accountExists(_email: string): Promise<boolean> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function resetAccountPassword(_newPassword: string): Promise<boolean> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function logoutCurrentAccount(): Promise<void> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

export async function getCurrentAccount(): Promise<RegisteredAccount | null> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}

// TODO(AUTH): Replace with POST /api/auth/password-reset/verify { email, code }.
export async function verifyPasswordResetCode(_email: string, _code: string): Promise<boolean> {
  throw new Error(NOT_INTEGRATED_MESSAGE);
}
