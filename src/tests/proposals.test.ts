import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { diffText } from "../core/diff";
import { GuardedVault, ManuscriptWriteRefused, mintWriteCapability } from "../core/guarded-vault";
import { applyAccepted, createProposal, decide, listProposals, proposalPath } from "../core/proposals";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const TEXT = "---\ntitle: One\n---\nThe captian walked to the harbour. He was tired.\n\nSecond paragraph, with a mistake: teh end.\n";

async function setup(text = TEXT) {
	const raw = new FakeVault({ "Book/one.md": text });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const edits = diffText(TEXT, TEXT.replace("captian", "captain").replace("teh", "the")).map((h) => ({ from: h.from, to: h.to, replacement: h.replacement }));
	const proposal = text === TEXT ? await createProposal(vault, book, chapter, text, { action: "proofread" }, edits, rnd, "2026-11-26T12:00:00Z") : (undefined as never);
	return { raw, vault, book, chapter, rnd, proposal };
}

describe("creating a proposal", () => {
	it("records the changes against the exact text and leaves the chapter byte-for-byte unchanged", async () => {
		const { raw, proposal, book } = await setup();
		expect(raw.files.get("Book/one.md")).toBe(TEXT);
		expect(proposal.edits.map((e) => [e.original, e.replacement, e.decision])).toEqual([["captian", "captain", "pending"], ["teh", "the", "pending"]]);
		expect(raw.files.has(proposalPath(book, proposal.id))).toBe(true);
		expect(raw.writes.every((p) => p.includes("/_book-harness/"))).toBe(true);
	});

	it("refuses changes that point outside the text or overlap", async () => {
		const { vault, book, chapter, rnd } = await setup();
		const make = (edits: Array<{ from: number; to: number; replacement: string }>) => createProposal(vault, book, chapter, "abcdef", { action: "x" }, edits, rnd, "t");
		await expect(make([{ from: 0, to: 99, replacement: "" }])).rejects.toThrow(/outside the chapter/);
		await expect(make([{ from: -1, to: 2, replacement: "" }])).rejects.toThrow(/outside the chapter/);
		await expect(make([{ from: 3, to: 2, replacement: "" }])).rejects.toThrow(/outside the chapter/);
		await expect(make([{ from: 0, to: 4, replacement: "" }, { from: 2, to: 5, replacement: "" }])).rejects.toThrow(/overlap/);
		await expect(make([{ from: 4, to: 5, replacement: "x" }, { from: 0, to: 2, replacement: "y" }])).resolves.toMatchObject({ edits: [{ from: 0 }, { from: 4 }] });
	});
});

describe("reviewing and applying (AC-S-1, AC-S-2)", () => {
	it("applies only the accepted change; rejected and pending text stays exactly as written", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		const decided = await decide(vault, book, proposal, ["e1"], "accepted");
		await decide(vault, book, decided, ["e2"], "rejected");
		const current = (await listProposals(vault, book)).proposals[0]!;
		const result = await applyAccepted(vault, book, chapter, current);
		expect(result).toMatchObject({ applied: 1, conflicts: [] });
		expect(raw.files.get("Book/one.md")).toBe(TEXT.replace("captian", "captain"));
		expect(raw.files.get("Book/one.md")).toContain("teh end");
		expect(result.proposal.edits.map((e) => e.decision)).toEqual(["applied", "rejected"]);
	});

	it("writes nothing when nothing is accepted", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		await decide(vault, book, proposal, ["e1", "e2"], "rejected");
		const before = raw.writes.length;
		const result = await applyAccepted(vault, book, chapter, (await listProposals(vault, book)).proposals[0]!);
		expect(result.applied).toBe(0);
		expect(raw.files.get("Book/one.md")).toBe(TEXT);
		expect(raw.writes.slice(before).every((p) => p.includes("/proposals/"))).toBe(true);
	});

	it("applies several accepted changes in one write", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		const accepted = await decide(vault, book, proposal, ["e1", "e2"], "accepted");
		const writesBefore = raw.writes.filter((p) => p === "Book/one.md").length;
		expect((await applyAccepted(vault, book, chapter, accepted)).applied).toBe(2);
		expect(raw.writes.filter((p) => p === "Book/one.md").length - writesBefore).toBe(1);
		expect(raw.files.get("Book/one.md")).toBe(TEXT.replace("captian", "captain").replace("teh", "the"));
	});

	it("re-finds a change by its surroundings when the chapter was edited elsewhere in the meantime", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		raw.files.set("Book/one.md", "A new first line.\n\n" + TEXT);
		const accepted = await decide(vault, book, proposal, ["e1"], "accepted");
		const result = await applyAccepted(vault, book, chapter, accepted);
		expect(result).toMatchObject({ applied: 1, conflicts: [] });
		expect(raw.files.get("Book/one.md")).toBe("A new first line.\n\n" + TEXT.replace("captian", "captain"));
	});

	it("never guesses: a changed or repeated place becomes a conflict and the chapter is untouched", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		const changed = TEXT.replace("The captian walked", "The sailor captian walked").replace("to the harbour", "to the pier");
		raw.files.set("Book/one.md", changed);
		const accepted = await decide(vault, book, proposal, ["e1"], "accepted");
		const result = await applyAccepted(vault, book, chapter, accepted);
		expect(result).toMatchObject({ applied: 0, conflicts: ["e1"] });
		expect(raw.files.get("Book/one.md")).toBe(changed);
		expect(result.proposal.edits[0]?.decision).toBe("conflict");
		const twice = "x " + TEXT + TEXT;
		raw.files.set("Book/one.md", twice);
		const again = await decide(vault, book, { ...result.proposal }, ["e2"], "accepted");
		expect((await applyAccepted(vault, book, chapter, again)).conflicts).toEqual(["e2"]);
		expect(raw.files.get("Book/one.md")).toBe(twice);
	});

	it("does not overwrite a concurrent edit: a failed check writes nothing and keeps the decision open", async () => {
		const { raw, vault, book, chapter, proposal } = await setup();
		const accepted = await decide(vault, book, proposal, ["e1"], "accepted");
		raw.writeAuthorized = () => Promise.resolve(false);
		await expect(applyAccepted(vault, book, chapter, accepted)).rejects.toThrow(/changed while the changes were being applied/);
		expect(raw.files.get("Book/one.md")).toBe(TEXT);
		expect((await listProposals(vault, book)).proposals[0]?.edits[0]?.decision).toBe("accepted");
	});

	it("treats edits that would collide after re-location as conflicts", async () => {
		const { raw, vault, book, chapter, rnd } = await setup("aaaa bbbb");
		const proposal = await createProposal(vault, book, chapter, "aaaa bbbb", { action: "x" }, [{ from: 0, to: 4, replacement: "A" }, { from: 5, to: 9, replacement: "B" }], rnd, "t");
		raw.files.set("Book/one.md", "aaaa bbbb");
		const forced = { ...proposal, edits: proposal.edits.map((e, i) => ({ ...e, decision: "accepted" as const, to: i === 0 ? 6 : e.to, original: i === 0 ? "aaaa b" : e.original })) };
		raw.files.set(proposalPath(book, proposal.id), raw.files.get(proposalPath(book, proposal.id))!);
		const result = await applyAccepted(vault, book, chapter, forced);
		expect(result.applied + result.conflicts.length).toBe(2);
		expect(result.conflicts.length).toBeGreaterThan(0);
	});

	it("refuses a chapter without a note and re-deciding what was applied", async () => {
		const { vault, book, chapter, proposal } = await setup();
		await expect(applyAccepted(vault, book, { ...chapter, notePath: null }, proposal)).rejects.toThrow(/no manuscript note/);
		const accepted = await decide(vault, book, proposal, ["e1"], "accepted");
		const applied = (await applyAccepted(vault, book, chapter, accepted)).proposal;
		const again = await decide(vault, book, applied, ["e1"], "rejected");
		expect(again.edits[0]?.decision).toBe("applied");
	});
});

describe("the gate", () => {
	it("refuses any other write to manuscript text, including a capability minted for another note", async () => {
		const { raw, vault } = await setup();
		await expect(vault.replaceIfUnchanged("Book/one.md", TEXT, "x")).rejects.toBeInstanceOf(ManuscriptWriteRefused);
		await expect(vault.writeManuscript(mintWriteCapability("pr_x", "Book/other.md"), "Book/one.md", TEXT, "x")).rejects.toBeInstanceOf(ManuscriptWriteRefused);
		expect(raw.files.get("Book/one.md")).toBe(TEXT);
	});
});

describe("stored proposals", () => {
	it.each([
		["a different note type", `---\nbh_schema: 1\nbh_type: book\nbh_id: x\n---\n`, /not a proposal/],
		["a newer schema", `---\nbh_schema: 9\nbh_type: proposal\nbh_id: x\n---\n`, /newer Book Harness/],
		["no records", `---\nbh_schema: 1\nbh_type: proposal\nbh_id: x\n---\ntext`, /no records block/],
		["broken JSON", "---\nbh_schema: 1\nbh_type: proposal\nbh_id: x\n---\n```bh-records\n{oops\n```", /not valid JSON/],
		["a malformed record", "---\nbh_schema: 1\nbh_type: proposal\nbh_id: x\n---\n```bh-records\n{}\n```", /malformed/],
		["null", "---\nbh_schema: 1\nbh_type: proposal\nbh_id: x\n---\n```bh-records\nnull\n```", /malformed/],
	])("reports %s", async (_n, text, reason) => {
		const { raw, vault, book } = await setup();
		raw.files.set(`Book/_book-harness/proposals/pr_zzzzzzzzzzzzzzzz.md`, text);
		const { problems } = await listProposals(vault, book);
		expect(problems.find((p) => p.includes("pr_zzzz"))).toMatch(reason);
	});

	it("drops malformed edits, keeps good ones, and reports unreadable files", async () => {
		const { raw, vault, book, proposal } = await setup();
		const path = proposalPath(book, proposal.id);
		raw.files.set(path, raw.files.get(path)!.replace(/"edits": \[/, '"edits": [null, {"id": 5}, {"id":"x","from":0,"to":1,"original":"a","replacement":"b","before":"","after":"","decision":"weird"},'));
		expect((await listProposals(vault, book)).proposals[0]?.edits).toHaveLength(2);
		raw.read = () => Promise.reject("io");
		expect((await listProposals(vault, book)).problems[0]).toContain(": io");
	});

	it("refuses to overwrite a proposal changed on another device", async () => {
		const { raw, vault, book, proposal } = await setup();
		raw.replaceIfUnchanged = (p, e, n) => (p.includes("/proposals/") ? Promise.resolve(false) : FakeVault.prototype.replaceIfUnchanged.call(raw, p, e, n));
		await expect(decide(vault, book, proposal, ["e1"], "accepted")).rejects.toThrow(/another device/);
	});
});
