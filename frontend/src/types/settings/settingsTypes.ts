export interface AccountSettings {
  userId: string;
  email: string;
}

export type ActionResult = {
  success: boolean;
  error?: string;
};

export type RequestEmailChangeResult = ActionResult;
