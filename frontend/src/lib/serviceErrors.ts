export type ServiceErrorCode = "API_NOT_INTEGRATED";
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export function notIntegrated(operation: string): never {
  throw new ServiceError("API_NOT_INTEGRATED", operation + " is not connected to a backend API yet.");
}
