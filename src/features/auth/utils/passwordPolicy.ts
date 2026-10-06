export const PASSWORD_MIN_LENGTH = 10;
// bcrypt ignores everything past 72 bytes, so the server refuses longer passwords.
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_RULE_TEXT =
  "at least 10 characters, including a letter and a number";
export const PASSWORD_HINT = "At least 10 characters, with a letter and a number";

const utf8Length = (value: string): number =>
  new TextEncoder().encode(value).length;

/** Null when a new password meets the server's policy, otherwise what's wrong with it. */
export function passwordPolicyError(password: string): string | null {
  if ([...password].length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (utf8Length(password) > PASSWORD_MAX_BYTES) return "That password is too long";
  if (!/\p{L}/u.test(password) || !/\d/.test(password))
    return "Include at least one letter and one number";
  return null;
}
