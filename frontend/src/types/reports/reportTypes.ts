export interface UserReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  conversationId: string;
  reason: string;
  createdAt: string;
}
