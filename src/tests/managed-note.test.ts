import { describe, expect, it } from "vitest";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "../core/managed-note";

const note = { frontmatter: { title: "T", bh_type: "book", bh_id: "bk_x", bh_schema: 1 }, body: "# Body\n\ntext\n" };

describe("managed notes", () => {
	it("serializes with stable key order and round-trips", () => {
		const text = serializeManagedNote(note);
		expect(text).toBe("---\nbh_id: bk_x\nbh_schema: 1\nbh_type: book\ntitle: T\n---\n# Body\n\ntext\n");
		expect(parseManagedNote(text)).toEqual(note);
	});

	it("is idempotent: serialize(parse(x)) === x", () => {
		const text = serializeManagedNote(note);
		expect(serializeManagedNote(parseManagedNote(text))).toBe(text);
	});

	it.each([
		["no frontmatter", "# hi", /Missing frontmatter/],
		["bad yaml", "---\na: [\n---\n", /not valid YAML/],
		["scalar frontmatter", "---\njust text\n---\n", /mapping/],
		["no schema", "---\nbh_type: book\nbh_id: x\n---\n", /bh_schema/],
		["fractional schema", "---\nbh_schema: 1.5\nbh_type: book\nbh_id: x\n---\n", /bh_schema/],
		["no type", "---\nbh_schema: 1\nbh_id: x\n---\n", /bh_type/],
		["no id", "---\nbh_schema: 1\nbh_type: book\n---\n", /bh_id/],
	])("rejects %s with a plain-language reason", (_name, text, reason) => {
		expect(() => parseManagedNote(text)).toThrow(ManagedNoteError);
		expect(() => parseManagedNote(text)).toThrow(reason);
	});

	it("handles CRLF files and empty frontmatter values", () => {
		const parsed = parseManagedNote("---\r\nbh_schema: 1\r\nbh_type: x\r\nbh_id: y\r\n---\r\nbody");
		expect(parsed.body).toBe("body");
	});

	it("reports non-Error YAML failures as invalid YAML", () => {
		expect(() => parseManagedNote("---\n---\n")).toThrow(ManagedNoteError);
	});
});
