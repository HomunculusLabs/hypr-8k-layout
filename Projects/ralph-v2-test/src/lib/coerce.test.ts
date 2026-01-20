import { describe, expect, it } from "bun:test";
import { coerceBool, coerceDate } from "./coerce";

describe("coerceBool", () => {
	it("handles boolean true", () => expect(coerceBool(true)).toBe(true));
	it("handles boolean false", () => expect(coerceBool(false)).toBe(false));
	it("handles string 'true'", () => expect(coerceBool("true")).toBe(true));
	it("handles string 'True'", () => expect(coerceBool("True")).toBe(true));
	it("handles string 'yes'", () => expect(coerceBool("yes")).toBe(true));
	it("handles string '1'", () => expect(coerceBool("1")).toBe(true));
	it("handles string 'false'", () => expect(coerceBool("false")).toBe(false));
	it("handles number 1", () => expect(coerceBool(1)).toBe(true));
	it("handles number 0", () => expect(coerceBool(0)).toBe(false));
	it("handles null", () => expect(coerceBool(null)).toBe(false));
	it("handles undefined", () => expect(coerceBool(undefined)).toBe(false));
});

describe("coerceDate", () => {
	it("parses valid date", () => {
		const d = coerceDate("2024-06-15");
		expect(d?.getFullYear()).toBe(2024);
		expect(d?.getMonth()).toBe(5);
		expect(d?.getDate()).toBe(15);
	});
	it("rejects invalid month", () =>
		expect(coerceDate("2024-13-01")).toBeNull());
	it("rejects invalid day", () =>
		expect(coerceDate("2024-02-30")).toBeNull());
	it("rejects malformed string", () =>
		expect(coerceDate("not-a-date")).toBeNull());
});
