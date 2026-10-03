import { passwordPolicyError } from "../passwordPolicy";

describe("passwordPolicyError", () => {
  it("accepts ten characters with a letter and a digit", () => {
    expect(passwordPolicyError("abcdefghi1")).toBeNull();
  });

  it("rejects fewer than ten characters", () => {
    expect(passwordPolicyError("abcdefg12")).toMatch(/at least 10/);
  });

  it("requires both a letter and a digit", () => {
    expect(passwordPolicyError("abcdefghijk")).toMatch(/letter and one number/);
    expect(passwordPolicyError("12345678901")).toMatch(/letter and one number/);
  });

  it("counts non-ASCII letters as letters", () => {
    expect(passwordPolicyError("ΑΒΓΔΕΖΗΘΙ1")).toBeNull();
  });

  it("limits the UTF-8 length to 72 bytes, not 72 characters", () => {
    expect(passwordPolicyError(`${"a".repeat(71)}1`)).toBeNull();
    expect(passwordPolicyError(`${"a".repeat(72)}1`)).toMatch(/too long/);
    expect(passwordPolicyError(`${"é".repeat(36)}1`)).toMatch(/too long/);
  });
});
