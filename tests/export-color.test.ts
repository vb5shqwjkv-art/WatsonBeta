import { describe, expect, it } from "vitest";
import { cssColorToHex } from "@/export/color";

describe("cssColorToHex", () => {
  it("maps named colors to hex", () => {
    expect(cssColorToHex("red")).toBe("FF0000");
    expect(cssColorToHex("green")).toBe("008000");
    expect(cssColorToHex("black")).toBe("000000");
  });

  it("normalizes hex (including shorthand)", () => {
    expect(cssColorToHex("#eab308")).toBe("EAB308");
    expect(cssColorToHex("#abc")).toBe("AABBCC");
  });

  it("parses rgb() — the form the browser serializes to", () => {
    expect(cssColorToHex("rgb(234, 179, 8)")).toBe("EAB308");
    expect(cssColorToHex("rgba(255, 0, 0, 0.5)")).toBe("FF0000");
  });

  it("returns undefined for unknown or empty input", () => {
    expect(cssColorToHex("")).toBeUndefined();
    expect(cssColorToHex(null)).toBeUndefined();
    expect(cssColorToHex("not-a-color")).toBeUndefined();
  });
});
