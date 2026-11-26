import type { Entity } from "./entities";
import type { ChapterEvidence, EvidenceItem } from "./extraction";

export type NodeKind = "chapter" | "passage" | "entity";
export type EdgeType = "contains" | "mentions" | "evidenced_in" | "co_occurs" | "precedes";

export interface GraphNode {
	id: string;
	kind: NodeKind;
	label: string;
}

/** Observed edges come from recorded text or records; inferred ones are computed by a stated rule, and say so. */
export interface GraphEdge {
	from: string;
	to: string;
	type: EdgeType;
	provenance: "observed" | "inferred";
	/** Where an observed edge comes from, or the rule that produced an inferred one. */
	basis: string;
}

export const nodeId = {
	chapter: (id: string): string => `chapter:${id}`,
	passage: (chapterId: string, passageId: string): string => `passage:${chapterId}:${passageId}`,
	entity: (id: string): string => `entity:${id}`,
};

/** The book's records seen as a graph. In memory, rebuilt from the notes whenever needed. */
export class KnowledgeGraph {
	readonly nodes = new Map<string, GraphNode>();
	readonly edges: GraphEdge[] = [];

	addNode(n: GraphNode): void {
		this.nodes.set(n.id, n);
	}

	addEdge(e: GraphEdge): void {
		if (!this.edges.some((x) => x.from === e.from && x.to === e.to && x.type === e.type)) this.edges.push(e);
	}

	/** Nodes one step away, in both directions, optionally limited to some edge types. */
	neighbors(id: string, types?: readonly EdgeType[]): Array<{ node: GraphNode; edge: GraphEdge }> {
		return this.edges
			.filter((e) => (e.from === id || e.to === id) && (!types || types.includes(e.type)))
			.flatMap((edge) => {
				const node = this.nodes.get(edge.from === id ? edge.to : edge.from);
				return node ? [{ node, edge }] : [];
			});
	}
}

export interface PassageInput {
	chapterId: string;
	passageId: string;
	start: number;
	end: number;
}

export interface MentionInput {
	chapterId: string;
	entityId: string;
	from: number;
	to: number;
	source: "name" | "manual";
}

export interface GraphInput {
	chaptersInOrder: ReadonlyArray<{ id: string; designation: string }>;
	passages: readonly PassageInput[];
	entities: readonly Entity[];
	mentions: readonly MentionInput[];
	evidence: readonly ChapterEvidence[];
}

/** Assemble the graph from already-loaded records. Pure: no files, no model. */
export function buildGraph(input: GraphInput): KnowledgeGraph {
	const g = new KnowledgeGraph();
	input.chaptersInOrder.forEach((c, i) => {
		g.addNode({ id: nodeId.chapter(c.id), kind: "chapter", label: c.designation });
		const next = input.chaptersInOrder[i + 1];
		if (next) g.addEdge({ from: nodeId.chapter(c.id), to: nodeId.chapter(next.id), type: "precedes", provenance: "observed", basis: "the author's chapter order" });
	});
	for (const e of input.entities) g.addNode({ id: nodeId.entity(e.id), kind: "entity", label: e.name });
	for (const p of input.passages) {
		g.addNode({ id: nodeId.passage(p.chapterId, p.passageId), kind: "passage", label: p.passageId });
		g.addEdge({ from: nodeId.chapter(p.chapterId), to: nodeId.passage(p.chapterId, p.passageId), type: "contains", provenance: "observed", basis: "chapter text" });
	}
	const together = new Map<string, Set<string>>();
	for (const p of input.passages) {
		const here = input.mentions.filter((m) => m.chapterId === p.chapterId && m.from >= p.start && m.to <= p.end);
		const ids = [...new Set(here.map((m) => m.entityId))];
		for (const id of ids) {
			const how = here.find((m) => m.entityId === id)?.source === "manual" ? "linked by the author" : "exact name in the text";
			g.addEdge({ from: nodeId.passage(p.chapterId, p.passageId), to: nodeId.entity(id), type: "mentions", provenance: "observed", basis: how });
		}
		for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) {
			const [x, y] = [a, b].sort();
			together.set(`${x}|${y}`, (together.get(`${x}|${y}`) ?? new Set()).add(nodeId.passage(p.chapterId, p.passageId)));
		}
	}
	for (const [pair, passages] of together) {
		const [a, b] = pair.split("|") as [string, string];
		g.addEdge({ from: nodeId.entity(a), to: nodeId.entity(b), type: "co_occurs", provenance: "inferred", basis: `named in the same passage (${passages.size} time${passages.size === 1 ? "" : "s"}); this does not say how they are related` });
	}
	for (const ev of input.evidence) {
		for (const item of ev.items) g.addEdge({ from: nodeId.entity(item.entityId), to: nodeId.chapter(ev.chapterId), type: "evidenced_in", provenance: "observed", basis: `extraction, quote: “${item.quote}”` });
	}
	return g;
}

export interface ContextBudget {
	maxEntities: number;
	maxHistoryPerEntity: number;
	maxChars: number;
}

export const DEFAULT_BUDGET: ContextBudget = { maxEntities: 6, maxHistoryPerEntity: 4, maxChars: 2400 };

export interface EntityContext {
	entityId: string;
	name: string;
	type: string;
	/** What the book's text supports about it, one line per chapter, in reading order. Primary evidence only. */
	history: Array<{ chapter: string; note: string; quote: string }>;
	/** Other entities named in the same passage. Inferred from proximity only. */
	alsoNamed: Array<{ name: string; basis: string }>;
	provenance: Array<"observed" | "inferred">;
}

export interface PassageContext {
	entities: EntityContext[];
	/** True when the budget cut something off; the context is a selection, never the whole picture. */
	truncated: boolean;
}

/**
 * Bounded expansion from a passage to the entities it names, what each chapter's text supports about them, and who else
 * appears with them. Deduplicated, primary evidence before anything inferred, and always limited by the budget.
 */
export function expandPassage(g: KnowledgeGraph, input: GraphInput, passage: { chapterId: string; passageId: string }, budget: ContextBudget = DEFAULT_BUDGET): PassageContext {
	const at = nodeId.passage(passage.chapterId, passage.passageId);
	const mentioned = g.neighbors(at, ["mentions"]).filter((n) => n.node.kind === "entity");
	// A chapter the registry no longer has sorts first (-1) rather than being dropped.
	const rank = (id: string): number => input.chaptersInOrder.findIndex((c) => c.id === id);
	let chars = 0;
	let truncated = mentioned.length > budget.maxEntities;
	const entities: EntityContext[] = [];
	for (const { node } of mentioned.slice(0, budget.maxEntities)) {
		const entity = input.entities.find((e) => nodeId.entity(e.id) === node.id) as Entity;
		const items: Array<{ chapterId: string; item: EvidenceItem }> = input.evidence.flatMap((ev) => ev.items.filter((i) => i.entityId === entity.id).map((item) => ({ chapterId: ev.chapterId, item })));
		items.sort((a, b) => rank(a.chapterId) - rank(b.chapterId));
		if (items.length > budget.maxHistoryPerEntity) truncated = true;
		const history = [] as EntityContext["history"];
		for (const { chapterId, item } of items.slice(0, budget.maxHistoryPerEntity)) {
			const row = { chapter: input.chaptersInOrder.find((c) => c.id === chapterId)?.designation ?? chapterId, note: item.note, quote: item.quote };
			const size = row.chapter.length + row.note.length + row.quote.length;
			if (chars + size > budget.maxChars) {
				truncated = true;
				break;
			}
			chars += size;
			history.push(row);
		}
		const also = g.neighbors(node.id, ["co_occurs"]).filter((n) => g.neighbors(at, ["mentions"]).some((m) => m.node.id === n.node.id));
		entities.push({ entityId: entity.id, name: entity.name, type: entity.type, history, alsoNamed: also.map((n) => ({ name: n.node.label, basis: n.edge.basis })), provenance: also.length > 0 ? ["observed", "inferred"] : ["observed"] });
	}
	return { entities, truncated };
}
