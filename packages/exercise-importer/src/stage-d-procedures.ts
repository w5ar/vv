import type { Catalog, Diagnostic, InventoryItem, ProcedureAnalysis, ProcedureSection, StepCandidate } from '@fds/domain';
import type { List, ListItem, Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import path from 'node:path';
import type { CatalogReview } from './review-files';
import { containsTerm, normalizeName, slugify, termSpans, toPosix } from './util';

/**
 * Stage D — Markdown procedure analysis. Preserves headings, sections and the verbatim source text
 * (with line numbers) of every paragraph and list item, and proposes **step candidates**:
 *
 * - numbered list items (`<file>#<section>/<number>`),
 * - prose paragraphs (`<file>#<section>/p<i>`),
 * - other list items (`<file>#<section>/l<i>`),
 *
 * excluding image-only paragraphs, figure captions (`**Skica 11** – …`), tables and lists recognised
 * as participant lists ("zapovjednik (Z),") or equipment lists ("3 „B” tlačne cijevi,"), which are
 * extracted separately. A list introduced by a paragraph about who performs the exercise
 * („…izvodi odjeljenje…”) or about the required equipment („…potrebna je … oprema…”) is read as a
 * participant or equipment list as a whole, so items without an abbreviation or quantity
 * („teklić.”, „prijenosna motorna vatrogasna pumpa,”) are not taken for steps. Bold quoted text („…!”) is extracted verbatim as **orders**. Pipe tables with
 * image references are extracted as **legend** entries (image file + displayed name).
 *
 * Role and equipment mentions are detected only from an explicit lexicon (catalog names + `terms`
 * in the review file); no morphological inference. Candidates are proposals: they become steps only
 * through authoring files (stages E/F).
 */

function plain(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node) return (node.children as Nodes[]).map(plain).join('');
  return '';
}

function verbatim(source: string, nodes: readonly Nodes[]): string {
  const first = nodes[0]?.position?.start.offset;
  const last = nodes[nodes.length - 1]?.position?.end.offset;
  if (first === undefined || last === undefined) return nodes.map(plain).join(' ');
  return source.slice(first, last).trim();
}

export interface Lexicon {
  readonly roles: ReadonlyMap<string, string[]>;
  readonly symbols: ReadonlyMap<string, string[]>;
  readonly equipment: ReadonlyMap<string, string[]>;
}

export function buildLexicon(catalog: Catalog | null, review: CatalogReview | null): Lexicon {
  const roles = new Map<string, string[]>();
  const symbols = new Map<string, string[]>();
  const equipment = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, id: string, term: string) => {
    const t = term.trim();
    if (!t) return;
    const list = map.get(id) ?? [];
    if (!list.some((x) => x.toLocaleLowerCase('hr') === t.toLocaleLowerCase('hr'))) list.push(t);
    map.set(id, list);
  };
  for (const r of catalog?.roles ?? []) add(roles, r.id, normalizeName(r.name));
  for (const s of catalog?.symbols ?? []) if (s.category !== 'nerazvrstano' && !s.annotation) add(symbols, s.id, normalizeName(s.name));
  for (const e of catalog?.equipmentTypes ?? []) add(equipment, e.id, normalizeName(e.name));
  for (const [id, terms] of Object.entries(review?.terms.roles ?? {})) for (const t of terms) add(roles, id, t);
  for (const [id, terms] of Object.entries(review?.terms.symbols ?? {})) for (const t of terms) add(symbols, id, t);
  for (const [id, terms] of Object.entries(review?.terms.equipment ?? {})) for (const t of terms) add(equipment, id, t);
  return { roles, symbols, equipment };
}

/**
 * Ids whose terms occur in `text`. An occurrence inside a longer term of another id does not count
 * („ključ za podzemni hidrant” names the key, not the hydrant).
 */
function mentions(text: string, map: ReadonlyMap<string, string[]>): string[] {
  const spans = new Map<string, Array<[number, number]>>();
  for (const [id, terms] of map) {
    const found = terms.flatMap((t) => termSpans(text, t));
    if (found.length > 0) spans.set(id, found);
  }
  const all = [...spans].flatMap(([id, list]) => list.map((s) => ({ id, s })));
  const inside = (a: [number, number], b: [number, number]) => b[0] <= a[0] && a[1] <= b[1] && b[1] - b[0] > a[1] - a[0];
  return [...spans]
    .filter(([id, list]) => list.some((s) => !all.some((o) => o.id !== id && inside(s, o.s))))
    .map(([id]) => id);
}

const IMAGE_MD = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const CAPTION = /^\*\*(Skica|Slika)\s+\d+\*\*/;
const ORDER = /\*\*(„[\s\S]*?”)\*\*/g;
const QUANTITY_ITEM = /^(\d+)\s+(.+?)[,.;]?$/;
const PARTICIPANT_ITEM = /^(.+?)\s*\(([A-ZČĆŽŠĐ][\p{L}\p{N}₀-₉]{0,5})\)[,.;]?$/u;
const PARTICIPANTS_INTRO = /\bvježbu\s+izvodi\b/i;
const EQUIPMENT_INTRO = /\bza\s+izvođenje\s+vježbe\s+potrebn/i;

type ListContext = 'participants' | 'equipment' | null;

/** Orders („…!”) inside bold text; a bold run with several quotations yields several orders. */
export function extractOrders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ORDER)) {
    const inner = (m[1] ?? '').trim();
    for (const part of inner.split(/”\s+„/)) {
      const t = part.replace(/^„/, '').replace(/”$/, '').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** Legend entries from pipe tables: every image in a row with its alt text as the displayed name. */
export function extractLegend(file: string, source: string): ProcedureAnalysis['legend'] {
  const out: ProcedureAnalysis['legend'] = [];
  source.split(/\r?\n/).forEach((lineText, i) => {
    const trimmed = lineText.trim();
    if (!trimmed.startsWith('|') || /^\|[\s:|-]+\|?$/.test(trimmed)) return;
    const cells = trimmed
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const plainCells = cells.map((c) => c.replace(IMAGE_MD, '').replace(/[`*]/g, '').trim()).filter(Boolean);
    for (const m of trimmed.matchAll(IMAGE_MD)) {
      const target = m[2] ?? '';
      if (/^[a-z]+:/i.test(target)) continue;
      out.push({
        file: toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(target)))),
        name: (m[1] ?? '').trim(),
        line: i + 1,
        cells: plainCells,
      });
    }
  });
  return out;
}

export function analyzeProcedure(
  file: string,
  source: string,
  lexicon: Lexicon,
  known: ReadonlyMap<string, InventoryItem>,
): { analysis: ProcedureAnalysis; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const tree: Root = fromMarkdown(source);
  const fileSlug = slugify(path.basename(file).replace(/\.(md|markdown)$/i, ''));
  const sections: ProcedureSection[] = [];
  const steps: StepCandidate[] = [];
  const orders: ProcedureAnalysis['orders'] = [];
  const participants: ProcedureAnalysis['participants'] = [];
  const equipmentList: ProcedureAnalysis['equipmentList'] = [];
  const diagramRefs: ProcedureAnalysis['diagramRefs'] = [];
  const usedSlugs = new Map<string, number>();
  const headingStack: { level: number; text: string }[] = [];
  const counters = new Map<string, { p: number; l: number }>();
  let title: string | undefined;

  let current: ProcedureSection = { id: 'uvod', heading: '', level: 0, line: 1, path: [], paragraphs: [], listItems: [] };
  sections.push(current);

  const counter = () => {
    let c = counters.get(current.id);
    if (!c) {
      c = { p: 0, l: 0 };
      counters.set(current.id, c);
    }
    return c;
  };

  const resolveRef = (url: string, line: number) => {
    if (/^[a-z]+:/i.test(url) || url.startsWith('#')) return;
    const clean = url.split('#')[0] ?? url;
    const resolved = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(clean))));
    const item = known.get(resolved);
    diagramRefs.push({ target: url, line, resolvedFile: item ? resolved : null, canonicalFile: item?.renderCopyOf ?? null });
    if (!item) {
      diagnostics.push({
        code: 'procedure.unresolved-reference',
        severity: 'warning',
        stage: 'D',
        message: `${file}:${line}: poveznica „${url}” ne upućuje na postojeću datoteku.`,
        source: { file, line },
      });
    }
  };

  const collectRefs = (n: Nodes) => {
    if ((n.type === 'image' || n.type === 'link') && n.position) resolveRef(n.url, n.position.start.line);
    if ('children' in n) for (const c of n.children as Nodes[]) collectRefs(c);
  };

  const addCandidate = (kind: StepCandidate['kind'], localId: string, nodes: readonly Nodes[], line: number, lineEnd: number) => {
    const text = verbatim(source, nodes);
    const plainText = nodes.map(plain).join(' ');
    const refs: string[] = [];
    const findRefs = (n: Nodes) => {
      if (n.type === 'image' || n.type === 'link') refs.push(n.url);
      if ('children' in n) for (const c of n.children as Nodes[]) findRefs(c);
    };
    nodes.forEach(findRefs);
    const id = `${fileSlug}#${current.id}/${localId}`;
    steps.push({
      id,
      kind,
      file,
      sectionId: current.id,
      sectionPath: [...current.path],
      ...(kind === 'numbered' ? { number: Number(localId) } : {}),
      text,
      line,
      lineEnd,
      roleMentions: mentions(plainText, lexicon.roles),
      equipmentMentions: mentions(plainText, lexicon.symbols),
      diagramRefs: refs,
      mappedTo: [],
      status: 'unmapped',
    });
    for (const o of extractOrders(text)) orders.push({ text: o, line, candidateId: id });
  };

  const handleList = (list: List, context: ListContext) => {
    list.children.forEach((item: ListItem, index) => {
      const line = item.position?.start.line ?? 0;
      const lineEnd = item.position?.end.line ?? line;
      const content = item.children.filter((c) => c.type !== 'list');
      const text = verbatim(source, content);
      current.listItems.push({ text, line, ordered: list.ordered === true });
      if (list.ordered) {
        addCandidate('numbered', String((list.start ?? 1) + index), content, line, lineEnd);
      } else {
        const plainText = content.map(plain).join(' ').trim();
        const qty = QUANTITY_ITEM.exec(plainText);
        const who = PARTICIPANT_ITEM.exec(plainText);
        const roleIds = mentions(plainText, lexicon.roles);
        if (context === 'equipment' || (qty && context !== 'participants')) {
          const name = (qty ? (qty[2] ?? '') : plainText.replace(/[,.;]$/, '')).trim();
          equipmentList.push({
            text: name,
            ...(qty ? { quantity: Number(qty[1]) } : {}),
            line,
            sectionId: current.id,
            equipmentTypeIds: mentions(name, lexicon.equipment),
          });
        } else if (context === 'participants' || (who && plainText.length <= 80)) {
          const name = (who ? (who[1] ?? '') : plainText.replace(/[,.;]$/, '')).trim();
          participants.push({ text: name, ...(who?.[2] ? { abbreviation: who[2].trim() } : {}), line, sectionId: current.id, roleIds });
          if (roleIds.length === 0) {
            diagnostics.push({
              code: 'mapping.unresolved-role',
              severity: 'warning',
              stage: 'D',
              message: `${file}:${line}: sudionik „${plainText}” nije povezan s ulogom iz kataloga.`,
              source: { file, line, excerpt: plainText },
            });
          }
        } else {
          addCandidate('list-item', `l${++counter().l}`, content, line, lineEnd);
        }
      }
      for (const nested of item.children) if (nested.type === 'list') handleList(nested, null);
    });
  };

  const isImageOnly = (n: Nodes) =>
    'children' in n && (n.children as Nodes[]).every((c) => c.type === 'image' || (c.type === 'text' && !c.value.trim()));

  // The paragraph right before a list decides how the list is read (see ListContext).
  let intro = '';
  for (const node of tree.children) {
    collectRefs(node);
    const introText = intro;
    intro = node.type === 'paragraph' ? plain(node) : '';
    if (node.type === 'heading') {
      const text = plain(node).trim();
      if (node.depth === 1 && title === undefined) title = text;
      while (headingStack.length > 0 && (headingStack[headingStack.length - 1]?.level ?? 0) >= node.depth) headingStack.pop();
      headingStack.push({ level: node.depth, text });
      const base = slugify(text) || 'odjeljak';
      const n = (usedSlugs.get(base) ?? 0) + 1;
      usedSlugs.set(base, n);
      current = {
        id: n === 1 ? base : `${base}-${n}`,
        heading: text,
        level: node.depth,
        line: node.position?.start.line ?? 0,
        path: headingStack.map((h) => h.text),
        paragraphs: [],
        listItems: [],
      };
      sections.push(current);
    } else if (node.type === 'list') {
      handleList(node, PARTICIPANTS_INTRO.test(introText) ? 'participants' : EQUIPMENT_INTRO.test(introText) ? 'equipment' : null);
    } else if (node.type === 'paragraph') {
      const text = verbatim(source, [node]);
      const line = node.position?.start.line ?? 0;
      current.paragraphs.push({ text, line });
      if (isImageOnly(node) || CAPTION.test(text) || text.startsWith('|')) continue;
      addCandidate('paragraph', `p${++counter().p}`, [node], line, node.position?.end.line ?? line);
    } else if (node.type === 'blockquote') {
      current.paragraphs.push({ text: verbatim(source, [node]), line: node.position?.start.line ?? 0 });
    }
  }

  // Role mentions across the document and the legacy "Sudionici/Uloge" bold-term check.
  const lines = source.split(/\r?\n/);
  const scan = (map: ReadonlyMap<string, string[]>) =>
    [...map].flatMap(([id, terms]) =>
      terms.flatMap((term) => {
        const at = lines.flatMap((l, i) => (containsTerm(l, term) ? [i + 1] : []));
        return at.length > 0 ? [{ id, term, lines: at }] : [];
      }),
    );
  const roleMentions = scan(lexicon.roles).map((m) => ({ roleId: m.id, term: m.term, lines: m.lines }));
  const equipmentMentions = scan(lexicon.symbols).map((m) => ({ symbolId: m.id, term: m.term, lines: m.lines }));

  for (const s of sections) {
    if (!/uloge|sudionici|sastav/i.test(s.heading)) continue;
    for (const item of s.listItems) {
      const m = /^\*\*(.+?)\*\*/.exec(item.text);
      const term = (m?.[1] ?? item.text.split(/[–-]/)[0] ?? '').trim();
      if (term && mentions(term, lexicon.roles).length === 0) {
        diagnostics.push({
          code: 'mapping.unresolved-role',
          severity: 'warning',
          stage: 'D',
          message: `${file}:${item.line}: uloga „${term}” nije povezana s ulogom iz kataloga.`,
          source: { file, line: item.line, excerpt: item.text },
        });
      }
    }
  }
  for (const e of equipmentList) {
    if (e.equipmentTypeIds.length === 0) {
      diagnostics.push({
        code: 'mapping.unresolved-equipment',
        severity: 'info',
        stage: 'D',
        message: `${file}:${e.line}: oprema „${e.text}” nije povezana s vrstom opreme iz kataloga.`,
        source: { file, line: e.line, excerpt: e.text },
      });
    }
  }

  // Candidate mode per document: numbered items are the steps when a document has any;
  // otherwise its paragraphs and list items are (prose procedures such as the source exercises).
  const numbered = steps.some((c) => c.kind === 'numbered');
  if (numbered) {
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i]?.kind !== 'numbered') steps.splice(i, 1);
  }
  if (steps.length > 0) {
    diagnostics.push({
      code: 'procedure.candidate-mode',
      severity: 'info',
      stage: 'D',
      message: `${file}: kandidati koraka su ${numbered ? 'numerirane stavke' : 'odlomci i stavke popisa'} (${steps.length}).`,
      source: { file },
    });
  }

  if (steps.length === 0) {
    diagnostics.push({
      code: 'procedure.no-candidates',
      severity: 'warning',
      stage: 'D',
      message: `${file}: nisu pronađeni kandidati za korake.`,
      source: { file },
    });
  }

  return {
    analysis: {
      file,
      title,
      synthetic: /SINTETI[ČC]KI/i.test(source),
      sections,
      steps,
      roleMentions,
      equipmentMentions,
      orders,
      participants,
      equipmentList,
      legend: extractLegend(file, source),
      diagramRefs,
    },
    diagnostics,
  };
}
