/**
 * Thrown inside a transaction to roll it back and answer with a refusal instead of a server error.
 * The reason is a message key the screen shows.
 */
export class Refusal<R extends string = string> extends Error {
  constructor(readonly reason: R) {
    super(reason);
  }
}

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

/** The database's answer when a unique value is already taken. */
export const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
