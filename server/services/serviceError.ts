import { ApiErrorCode } from '../config/constants';

export class ServiceError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status: number) {
    super(message);
  }
}
