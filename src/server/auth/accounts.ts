/** Usernames are stored in lower case, without surrounding spaces. */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Better Auth needs a unique email address for every account. Officers often have none, so their
 * account gets an address under the reserved .invalid domain, which can never receive mail.
 * The officer's real address, if any, is kept in `contactEmail`.
 */
export function placeholderEmail(username: string): string {
  return `${normaliseUsername(username)}@no-email.invalid`;
}
