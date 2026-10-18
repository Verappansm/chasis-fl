import { MongoServerError } from "mongodb";

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

export function isDuplicateKey(err: unknown): err is MongoServerError {
  return err instanceof MongoServerError && err.code === 11000;
}
