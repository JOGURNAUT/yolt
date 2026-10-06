import { describe, expect, it } from "vitest";
import { normalizeInstagramHandle, normalizeSize } from "./profile";

describe("normalizeSize", () => {
  it.each([
    ["m", "M"],
    ["  uk   8 ", "UK 8"],
    ["W32  L32", "W32 L32"],
  ])("%j → %j", (input, expected) => expect(normalizeSize(input)).toBe(expected));
});

describe("normalizeInstagramHandle", () => {
  it.each([
    ["@SecondLoop.Thrift", "secondloop.thrift"],
    ["second_loop", "second_loop"],
    ["https://www.instagram.com/Second_Loop/?hl=en", "second_loop"],
    ["instagram.com/a.b", "a.b"],
  ])("%j → %j", (input, expected) => expect(normalizeInstagramHandle(input)).toBe(expected));

  it.each(["", "@", "has space", "bad-dash", "two..dots", "ends.", "x".repeat(31), "émoji"])("rejects %j", (input) =>
    expect(normalizeInstagramHandle(input)).toBeNull(),
  );
});
