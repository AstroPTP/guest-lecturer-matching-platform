export interface AccountSettings {
  userId: string;
  email: string;
  password: string; 
}

export interface PendingEmailChange {
  newEmail: string;
  code: string;
  expiresAt: number; 
}

export type ActionResult = {
  success: boolean;
  error?: string;
};

export type RequestEmailChangeResult = ActionResult;
