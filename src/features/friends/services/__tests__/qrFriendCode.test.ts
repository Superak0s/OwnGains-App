import {
  FRIEND_QR_TYPE,
  buildFriendQrPayload,
  parseFriendQrPayload,
} from "../qrFriendCode";

describe("parseFriendQrPayload", () => {
  it("round-trips a payload built by buildFriendQrPayload", () => {
    expect(parseFriendQrPayload(buildFriendQrPayload(42, "sam"))).toEqual({
      type: FRIEND_QR_TYPE,
      id: 42,
      username: "sam",
    });
  });

  it("accepts a string id", () => {
    expect(parseFriendQrPayload(buildFriendQrPayload("u-7", "sam"))?.id).toBe(
      "u-7",
    );
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -3],
    ["fractional", 1.5],
    ["blank string", "  "],
    ["object", { id: 1 }],
    ["null", null],
  ])("rejects a %s id", (_label, id) => {
    const raw = JSON.stringify({ type: FRIEND_QR_TYPE, id, username: "sam" });
    expect(parseFriendQrPayload(raw)).toBeNull();
  });

  it("rejects a blank or missing username", () => {
    expect(
      parseFriendQrPayload(JSON.stringify({ type: FRIEND_QR_TYPE, id: 1, username: " " })),
    ).toBeNull();
    expect(parseFriendQrPayload(JSON.stringify({ type: FRIEND_QR_TYPE, id: 1 }))).toBeNull();
  });

  it("rejects another QR type, non-JSON and JSON null", () => {
    expect(
      parseFriendQrPayload(JSON.stringify({ type: "other", id: 1, username: "sam" })),
    ).toBeNull();
    expect(parseFriendQrPayload("https://example.com")).toBeNull();
    expect(parseFriendQrPayload("null")).toBeNull();
  });
});
