import { randomInt } from "node:crypto";

/** Letters and digits that can't be confused when read aloud or copied by hand (no 0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * ADM-2, ADM-5: a temporary password of 12 random characters, written in three groups of four
 * (for example "Kt7m-R42q-Zn4v"), so the admin can read it to the officer over the phone.
 */
export function generateTemporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return [group(), group(), group()].join("-");
}
