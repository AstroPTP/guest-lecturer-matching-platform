
// need to connect

export interface ApiErrorResponse {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResponse<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export interface SendInterestRequest {
  targetUserId: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface RespondToEventRequest {
  response: "accepted" | "declined";
}

