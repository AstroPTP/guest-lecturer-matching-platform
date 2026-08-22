/**
 * The error envelope the NestJS backend actually sends, from SAS §2.5.5
 * Table 4 — see backend/src/common/error-codes.ts and the
 * GlobalExceptionFilter that emits it.
 *
 * `correlationId` was previously declared here as `requestId`, which no
 * response ever contained.
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
  fieldErrors?: Record<string, string[]>;
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

