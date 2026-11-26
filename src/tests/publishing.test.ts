// @vitest-environment happy-dom
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { exportFileName, writeExport } from "../platform/export-writer";
import type { Book } from "../core/books";
import type { Chapter } from "../core/chapters";
import { buildEpub } from "../core/publishing/epub";
import { inlines, parseChapter, plainText, type Block } from "../core/publishing/markdown";
import { blocksExport, planExport, type ExportChapter } from "../core/publishing/validate";

const book: Book = { id: "bk_aaaaaaaaaaaaaaaa", folder: "B", title: "Salt & Ledger", primaryLanguage: "en", targetLanguages: [], completion: { chapterStatus: "finalized" }, author: "A. Writer" };
const chapter = (n: number, status: Chapter["status"] = "finalized", notePath: string | null = `B/${n}.md`): Chapter => ({ id: `ch_${String(n).padStart(16, "a")}`, bookId: book.id, designation: `Chapter ${n}`, order: n, status, notePath, path: `m${n}` });
const item = (n: number, text: string | null, status: Chapter["status"] = "finalized", notePath: string | null = `B/${n}.md`): ExportChapter => ({ chapter: chapter(n, status, notePath), text });

describe("markdown subset", () => {
	it("parses headings, paragraphs, quotes, scene breaks and emphasis, and removes Obsidian-only syntax", () => {
		const parsed = parseChapter("---\ntitle: X\nSECRET-FRONT: 1\n---\n# Chapter 1: The Lamp\n\nShe said *hello* to **everyone** and _again_.\nSecond line.\n\n%% hidden note %%\n<!-- comment -->\n> A quote\n> goes on\n\n---\n\nSee [[Greywater Light]] and [[Nora Voss|Nora]] and [[Note#Heading]] and ![[map.png]] and [site](http://x) and `code`.");
		expect(parsed.blocks.map((b) => b.t)).toEqual(["heading", "p", "quote", "break", "p"]);
		expect(plainText((parsed.blocks[1] as Extract<Block, { t: "p" }>).c)).toBe("She said hello to everyone and again. Second line.");
		expect(plainText((parsed.blocks[4] as Extract<Block, { t: "p" }>).c)).toBe("See Greywater Light and Nora and Note and  and site and code.");
		expect(parsed.embeds).toBe(1);
		const all = JSON.stringify(parsed);
		for (const leak of ["SECRET-FRONT", "hidden note", "comment", "map.png", "http://x", "[["]) expect(all).not.toContain(leak);
	});
	it("keeps unsupported constructs as plain text and reports them", () => {
		const parsed = parseChapter("- one\n\n1. two\n\n```\ncode\n```\n\n| a | b |\n\n[^1]: note\n\n![alt](pic.png)");
		expect(parsed.unsupported).toEqual(["a code block", "a footnote", "a list", "a table"]);
		expect(parsed.blocks.length).toBeGreaterThan(3);
		expect(parsed.embeds).toBe(1);
	});
	it("does not treat underscores inside words as emphasis and handles empty input", () => {
		expect(inlines("snake_case_name and _real_")).toEqual([{ t: "text", s: "snake_case_name and " }, { t: "em", c: [{ t: "text", s: "real" }] }]);
		expect(inlines("__bold__ and a__b__c")).toEqual([{ t: "strong", c: [{ t: "text", s: "bold" }] }, { t: "text", s: " and a__b__c" }]);
		expect(parseChapter("").blocks).toEqual([]);
		expect(parseChapter("%% only a comment %%").blocks).toEqual([]);
		expect(parseChapter("a\r\nb").blocks).toHaveLength(1);
		expect(parseChapter("> q\ntext").blocks.map((b) => b.t)).toEqual(["quote", "p"]);
		expect(parseChapter("text\n> q").blocks.map((b) => b.t)).toEqual(["p", "quote"]);
	});
});

describe("export plan", () => {
	it("passes a finished book with an author", () => {
		const plan = planExport(book, [item(2, "Two."), item(1, "One.")]);
		expect(plan.issues).toEqual([]);
		expect(plan.included.map((i) => i.chapter.designation)).toEqual(["Chapter 1", "Chapter 2"]);
		expect(blocksExport(plan)).toBe(false);
	});
	it("blocks on every kind of gap and lists what would be omitted", () => {
		const plan = planExport({ ...book, author: undefined }, [item(1, "One.", "drafting"), item(2, null, "finalized", null), item(3, null), item(4, "  \n"), item(5, "![[a.png]]\n\n- list\n\nText.")], new Set([chapter(1).id]));
		const text = plan.issues.map((i) => `${i.severity}: ${i.message}`).join("\n");
		expect(text).toContain("The author is not set");
		expect(text).toContain("Chapter 1 is drafting; this book requires finalized");
		expect(text).toContain("proposed changes still waiting");
		expect(text).toContain("Chapter 2: planned, but no note");
		expect(text).toContain("Chapter 3: its note was not found");
		expect(text).toContain("Chapter 4: it has no text");
		expect(text).toContain("a list");
		expect(text).toContain("1 embedded file ");
		expect(plan.omitted.map((o) => o.chapter.designation)).toEqual(["Chapter 2", "Chapter 3", "Chapter 4"]);
		expect(blocksExport(plan)).toBe(true);
		expect(planExport(book, []).issues[0]?.message).toBe("The book has no chapters.");
		expect(planExport(book, [item(1, "![[a.png]] ![[b.png]]\n\nx")]).issues.map((i) => i.message).join()).toContain("2 embedded files");
	});
});

describe("EPUB", () => {
	const chapters = [item(1, "# Chapter 1: The <Lamp> & more\n\nFirst *para* and **bold**.\n\nSecond.\n\n---\n\nAfter break.\n\n> Quote\n\nAfter quote."), item(2, "No title heading here.\n\n## Sub")];
	const files = (bytes: Uint8Array) => unzipSync(bytes);

	it("is a valid-shaped EPUB 3 package with the chapters in order", () => {
		const bytes = buildEpub(book, chapters, { modified: "2026-11-26T12:00:00Z" });
		expect(strFromU8(bytes.subarray(0, 60))).toContain("mimetypeapplication/epub+zip"); // first entry, stored
		const zip = files(bytes);
		expect(Object.keys(zip)).toEqual(["mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/style.css", "OEBPS/chapter001.xhtml", "OEBPS/chapter002.xhtml"]);
		const opf = strFromU8(zip["OEBPS/content.opf"] as Uint8Array);
		expect(opf).toContain("<dc:title>Salt &amp; Ledger</dc:title>");
		expect(opf).toContain("<dc:creator>A. Writer</dc:creator>");
		expect(opf).toContain('<dc:language>en</dc:language>');
		expect(opf).toContain('<itemref idref="chapter001"/>\n<itemref idref="chapter002"/>');
		expect(opf).toContain("2026-11-26T12:00:00Z");
		const one = strFromU8(zip["OEBPS/chapter001.xhtml"] as Uint8Array);
		expect(one).toContain("<h1>Chapter 1: The &lt;Lamp&gt; &amp; more</h1>");
		expect(one).toContain('<p class="first">First <em>para</em> and <strong>bold</strong>.</p>');
		expect(one).toContain("<p>Second.</p>");
		expect(one).toContain('<hr class="scene"/>');
		expect(one).toContain('<p class="first">After break.</p>');
		expect(one).toContain("<blockquote><p>Quote</p></blockquote>");
		expect(one).toContain('<p class="first">After quote.</p>');
		const two = strFromU8(zip["OEBPS/chapter002.xhtml"] as Uint8Array);
		expect(two).toContain("<h1>Chapter 2</h1>");
		expect(two).toContain("<h3>Sub</h3>");
		const nav = strFromU8(zip["OEBPS/nav.xhtml"] as Uint8Array);
		expect(nav).toContain('<a href="chapter001.xhtml">Chapter 1: The &lt;Lamp&gt; &amp; more</a>');
		expect(strFromU8(zip["OEBPS/toc.ncx"] as Uint8Array)).toContain('playOrder="2"');
	});
	it("writes well-formed XML everywhere", () => {
		const zip = files(buildEpub(book, chapters, { modified: "2026-11-26T12:00:00Z" }));
		for (const [name, data] of Object.entries(zip)) {
			if (name === "mimetype" || name.endsWith(".css")) continue;
			const doc = new DOMParser().parseFromString(strFromU8(data).replace(/<link[^>]*>/, ""), "text/xml");
			expect(doc.getElementsByTagName("parsererror").length, name).toBe(0);
		}
	});
	it("would notice malformed XML (control for the check above)", () => {
		expect(new DOMParser().parseFromString("<a><b></a>", "text/xml").getElementsByTagName("parsererror").length).toBe(1);
	});
	it("is deterministic and carries nothing but the chapters (sentinel leak test)", () => {
		const secret = [item(1, "---\nSENTINEL_PROPS: x\n---\n%% SENTINEL_COMMENT %%\n\nBody [[SENTINEL_LINK|shown]]. ![[SENTINEL_EMBED.png]]")];
		const a = buildEpub(book, secret, { modified: "2026-11-26T12:00:00Z" });
		const b = buildEpub(book, secret, { modified: "2026-11-26T12:00:00Z" });
		expect(Array.from(a)).toEqual(Array.from(b));
		const all = Object.values(files(a)).map((d) => strFromU8(d)).join("\n");
		expect(all).not.toContain("SENTINEL");
		expect(all).toContain("shown");
		expect(all).not.toContain("_book-harness");
	});
	it("works for a book with no author text and an empty chapter list", () => {
		const zip = files(buildEpub({ ...book, author: undefined }, [], { modified: "2026-11-26T12:00:00Z" }));
		expect(strFromU8(zip["OEBPS/content.opf"] as Uint8Array)).toContain("<dc:creator></dc:creator>");
	});
});

describe("export files", () => {
	it("names files safely from any title and marks drafts", () => {
		expect(exportFileName("Salt & Ledger: Teil 1", "2026-11-26T12:00:00.000Z", false)).toBe("Salt-Ledger-Teil-1-2026-11-26.epub");
		expect(exportFileName("Příběh světla", "2026-11-26T12:00:00.000Z", true)).toBe("Příběh-světla-draft-2026-11-26.epub");
		expect(exportFileName("???", "2026-11-26T12:00:00.000Z", false)).toBe("book-2026-11-26.epub");
	});
	it("writes the bytes into the book's exports folder, creating it once", async () => {
		const written = new Map<string, ArrayBuffer>();
		const dirs = new Set<string>();
		const adapter = { exists: (p: string) => Promise.resolve(dirs.has(p)), mkdir: vi.fn((p: string) => (dirs.add(p), Promise.resolve())), writeBinary: (p: string, d: ArrayBuffer) => (written.set(p, d), Promise.resolve()) };
		const app = { vault: { adapter } } as never;
		const bytes = new Uint8Array([9, 1, 2, 3]).subarray(1);
		expect(await writeExport(app, "My Book", "a.epub", bytes)).toBe("My Book/exports/a.epub");
		await writeExport(app, "My Book", "b.epub", bytes);
		expect(adapter.mkdir).toHaveBeenCalledTimes(1);
		expect(Array.from(new Uint8Array(written.get("My Book/exports/a.epub") as ArrayBuffer))).toEqual([1, 2, 3]);
	});
});
