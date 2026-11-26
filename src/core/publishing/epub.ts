import { zipSync, strToU8, type Zippable } from "fflate";
import type { Book } from "../books";
import { parseChapter, plainText, type Block, type Inline } from "./markdown";
import type { ExportChapter } from "./validate";

/**
 * EPUB 3 assembly. Deterministic: the same chapters and metadata always give the same bytes (fixed archive timestamps,
 * identifiers derived from the book id), so an export can be compared and a re-export does not look like a change.
 */
export interface EpubOptions {
	/** When the export was made, ISO 8601 UTC without milliseconds (the format EPUB requires for dcterms:modified). */
	modified: string;
	/** Language of the edition; the book's primary language when absent. */
	language?: string;
}

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderInline(c: readonly Inline[]): string {
	return c.map((i) => (i.t === "text" ? escapeXml(i.s) : i.t === "em" ? `<em>${renderInline(i.c)}</em>` : `<strong>${renderInline(i.c)}</strong>`)).join("");
}

function renderBlock(b: Block, first: { used: boolean }): string {
	if (b.t === "break") return '<hr class="scene"/>';
	if (b.t === "heading") return `<h${Math.min(b.level + 1, 6)}>${renderInline(b.c)}</h${Math.min(b.level + 1, 6)}>`;
	if (b.t === "quote") return `<blockquote><p>${renderInline(b.c)}</p></blockquote>`;
	// the first paragraph after a heading or scene break is not indented, as in printed books
	const cls = first.used ? "" : ' class="first"';
	first.used = true;
	return `<p${cls}>${renderInline(b.c)}</p>`;
}

const CSS = `body { font-family: serif; line-height: 1.45; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.2; }
h1 { margin: 2em 0 1em; }
p { margin: 0; text-indent: 1.4em; }
p.first { text-indent: 0; }
blockquote { margin: 1em 1.5em; }
hr.scene { border: 0; margin: 1.4em auto; text-align: center; }
hr.scene::after { content: "* * *"; }
`;

interface Built {
	id: string;
	file: string;
	title: string;
	xhtml: string;
}

function xhtml(lang: string, title: string, body: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}" xml:lang="${escapeXml(lang)}">\n<head>\n<meta charset="utf-8"/>\n<title>${escapeXml(title)}</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

function buildChapter(lang: string, item: ExportChapter, n: number): Built {
	const { blocks } = parseChapter(item.text as string);
	const head = blocks[0];
	const hasTitle = head?.t === "heading" && head.level === 1;
	const title = hasTitle ? plainText(head.c) : item.chapter.designation;
	const rest = hasTitle ? blocks.slice(1) : blocks;
	const first = { used: false };
	const body = rest
		.map((b) => {
			if (b.t !== "p") first.used = false;
			return renderBlock(b, first);
		})
		.join("\n");
	const id = `chapter${String(n).padStart(3, "0")}`;
	return { id, file: `${id}.xhtml`, title, xhtml: xhtml(lang, title, `<section epub:type="chapter">\n<h1>${escapeXml(title)}</h1>\n${body}\n</section>`) };
}

const IMMUTABLE_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

export function buildEpub(book: Book, chapters: readonly ExportChapter[], options: EpubOptions): Uint8Array {
	const lang = options.language ?? book.primaryLanguage;
	const built = chapters.map((c, i) => buildChapter(lang, c, i + 1));
	const uid = `urn:bookharness:${book.id}`;
	const nav = xhtml(
		lang,
		book.title,
		`<nav epub:type="toc" id="toc">\n<h1>${escapeXml(book.title)}</h1>\n<ol>\n${built.map((b) => `<li><a href="${b.file}">${escapeXml(b.title)}</a></li>`).join("\n")}\n</ol>\n</nav>`,
	);
	const ncx = `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n<head><meta name="dtb:uid" content="${escapeXml(uid)}"/></head>\n<docTitle><text>${escapeXml(book.title)}</text></docTitle>\n<navMap>\n${built.map((b, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(b.title)}</text></navLabel><content src="${b.file}"/></navPoint>`).join("\n")}\n</navMap>\n</ncx>\n`;
	const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${escapeXml(lang)}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="uid">${escapeXml(uid)}</dc:identifier>\n<dc:title>${escapeXml(book.title)}</dc:title>\n<dc:language>${escapeXml(lang)}</dc:language>\n<dc:creator>${escapeXml(book.author ?? "")}</dc:creator>\n<meta property="dcterms:modified">${escapeXml(options.modified)}</meta>\n</metadata>\n<manifest>\n<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n<item id="css" href="style.css" media-type="text/css"/>\n${built.map((b) => `<item id="${b.id}" href="${b.file}" media-type="application/xhtml+xml"/>`).join("\n")}\n</manifest>\n<spine toc="ncx">\n${built.map((b) => `<itemref idref="${b.id}"/>`).join("\n")}\n</spine>\n</package>\n`;
	const container = `<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n`;
	const stored = { level: 0 as const, mtime: IMMUTABLE_DATE };
	const deflated = { level: 6 as const, mtime: IMMUTABLE_DATE };
	// `mimetype` must be the first entry and stored uncompressed (EPUB OCF); object key order is the archive order.
	const files: Zippable = {
		mimetype: [strToU8("application/epub+zip"), stored],
		"META-INF/container.xml": [strToU8(container), deflated],
		"OEBPS/content.opf": [strToU8(opf), deflated],
		"OEBPS/nav.xhtml": [strToU8(nav), deflated],
		"OEBPS/toc.ncx": [strToU8(ncx), deflated],
		"OEBPS/style.css": [strToU8(CSS), deflated],
	};
	for (const b of built) files[`OEBPS/${b.file}`] = [strToU8(b.xhtml), deflated];
	return zipSync(files);
}
