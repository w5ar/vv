import type { Catalog, Diagnostic, ProcedureAnalysis, ProcedureSection, StepCandidate } from '@fds/domain';
import type { List, ListItem, Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import path from 'node:path';
import type { CatalogReview } from './review-files';
import { containsTerm, normalizeName, slugify, toPosix } from './util';

/**
 * Stage D — Markdown procedure analysis. Preserves headings, sections,
 * numbered steps (verbatim source text with line numbers) and references to
 * diagrams. Role and equipment mentions are detected only from an explicit,
 * reviewed lexicon (catalog names + `terms` in the review file); no
 * morphological inference is attempted. Numbered list items become *step
 * candidates*: proposals that must be mapped and validated in stage E.
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
}

export function buildLexicon(catalog: Catalog | null, review: CatalogReview | null): Lexicon {
  const roles = new Map<string, string[]>();
  const symbols = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, id: string, term: string) => {
    const t = term.trim();
    if (!t) return;
    const list = map.get(id) ?? [];
    if (!list.some((x) => x.toLocaleLowerCase('hr') === t.toLocaleLowerCase('hr'))) list.push(t);
    map.set(id, list);
  };
  for (const r of catalog?.roles ?? []) add(roles, r.id, normalizeName(r.name));
  for (const s of catalog?.symbols ?? []) if (s.category !== 'nerazvrstano') add(symbols, s.id, normalizeName(s.name));
  for (const [id, terms] of Object.entries(review?.terms.roles ?? {})) for (const t of terms) add(roles, id, t);
  for (const [id, terms] of Object.entries(review?.terms.symbols ?? {})) for (const t of terms) add(symbols, id, t);
  return { roles, symbols };
}

function mentions(text: string, map: ReadonlyMap<string, string[]>): string[] {
  const out: string[] = [];
  for (const [id, terms] of map) if (terms.some((t) => containsTerm(text, t))) out.push(id);
  return out;
}

export function analyzeProcedure(
  file: string,
  source: string,
  lexicon: Lexicon,
  knownFiles: ReadonlySet<string>,
): { analysis: ProcedureAnalysis; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const tree: Root = fromMarkdown(source);
  const fileSlug = slugify(path.basename(file).replace(/\.(md|markdown)$/i, ''));
  const sections: ProcedureSection[] = [];
  const steps: StepCandidate[] = [];
  const diagramRefs: ProcedureAnalysis['diagramRefs'] = [];
  const usedSlugs = new Map<string, number>();
  const headingStack: { level: number; text: string }[] = [];
  let title: string | undefined;

  let current: ProcedureSection = { id: 'uvod', heading: '', level: 0, line: 1, path: [], paragraphs: [], listItems: [] };
  sections.push(current);

  const resolveRef = (url: string, line: number) => {
    if (/^[a-z]+:/i.test(url) || url.startsWith('#')) return;
    const clean = url.split('#')[0] ?? url;
    const resolved = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(clean))));
    diagramRefs.push({ target: url, line, resolvedFile: knownFiles.has(resolved) ? resolved : null });
    if (!knownFiles.has(resolved)) {
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

  const handleList = (list: List) => {
    list.children.forEach((item: ListItem, index) => {
      const line = item.position?.start.line ?? 0;
      const lineEnd = item.position?.end.line ?? line;
      const content = item.children.filter((c) => c.type !== 'list');
      const text = verbatim(source, content);
      current.listItems.push({ text, line, ordered: list.ordered === true });
      if (list.ordered) {
        const number = (list.start ?? 1) + index;
        const plainText = content.map(plain).join(' ');
        const refs: string[] = [];
        const findRefs = (n: Nodes) => {
          if (n.type === 'image' || n.type === 'link') refs.push(n.url);
          if ('children' in n) for (const c of n.children as Nodes[]) findRefs(c);
        };
        content.forEach(findRefs);
        steps.push({
          id: `${fileSlug}#${current.id}/${number}`,
          file,
          sectionId: current.id,
          sectionPath: [...current.path],
          number,
          text,
          line,
          lineEnd,
          roleMentions: mentions(plainText, lexicon.roles),
          equipmentMentions: mentions(plainText, lexicon.symbols),
          diagramRefs: refs,
          mappedTo: [],
          status: 'unmapped',
        });
      }
      for (const nested of item.children) if (nested.type === 'list') handleList(nested);
    });
  };

  for (const node of tree.children) {
    collectRefs(node);
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
      handleList(node);
    } else if (node.type === 'paragraph' || node.type === 'blockquote') {
      current.paragraphs.push({ text: verbatim(source, [node]), line: node.position?.start.line ?? 0 });
    }
  }

  // Role mentions across the whole document (for traceability) and unresolved role names.
  const lines = source.split(/\r?\n/);
  const roleMentions = [...lexicon.roles].flatMap(([roleId, terms]) =>
    terms.flatMap((term) => {
      const at = lines.flatMap((l, i) => (containsTerm(l, term) ? [i + 1] : []));
      return at.length > 0 ? [{ roleId, term, lines: at }] : [];
    }),
  );
  const equipmentMentions = [...lexicon.symbols].flatMap(([symbolId, terms]) =>
    terms.flatMap((term) => {
      const at = lines.flatMap((l, i) => (containsTerm(l, term) ? [i + 1] : []));
      return at.length > 0 ? [{ symbolId, term, lines: at }] : [];
    }),
  );

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

  if (steps.length === 0) {
    diagnostics.push({
      code: 'procedure.no-numbered-steps',
      severity: 'warning',
      stage: 'D',
      message: `${file}: nisu pronađeni numerirani koraci; kandidati za korake ne mogu se predložiti automatski.`,
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
      diagramRefs,
    },
    diagnostics,
  };
}
