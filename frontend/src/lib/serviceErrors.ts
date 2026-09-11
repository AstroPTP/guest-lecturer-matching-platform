export const NOT_INTEGRATED_MESSAGE = "This action isn't connected to a backend yet.";

export type ServiceErrorCode = "API_NOT_INTEGRATED";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export function notIntegrated(): never {
  throw new ServiceError("API_NOT_INTEGRATED", NOT_INTEGRATED_MESSAGE);
}
