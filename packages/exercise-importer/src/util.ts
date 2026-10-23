import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Repository root: nearest ancestor containing pnpm-workspace.yaml. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Recursively lists files (repo-relative, POSIX, sorted). Missing directories yield []. */
export async function listFiles(repoRoot: string, relDir: string): Promise<string[]> {
  const abs = path.join(repoRoot, relDir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(toPosix(path.relative(repoRoot, full)));
    }
  };
  await walk(abs);
  return out.sort();
}

export async function readText(repoRoot: string, rel: string): Promise<string> {
  return readFile(path.join(repoRoot, rel), 'utf8');
}

export async function fileSize(repoRoot: string, rel: string): Promise<number> {
  return (await stat(path.join(repoRoot, rel))).size;
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

const TRANSLIT: Record<string, string> = { č: 'c', ć: 'c', đ: 'd', š: 's', ž: 'z', Č: 'c', Ć: 'c', Đ: 'd', Š: 's', Ž: 'z' };

/** ASCII slug, transliterating Croatian letters (č ć đ š ž). */
export function slugify(text: string): string {
  return text
    .replace(/[čćđšžČĆĐŠŽ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lowercased name without parenthetical qualifiers, for conservative name matching. */
export function normalizeName(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('hr');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive occurrence test that respects Croatian letters. */
export function containsTerm(text: string, term: string): boolean {
  if (!term.trim()) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(text);
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Joins a dataset-relative path to the dataset root (POSIX). */
export function joinRel(root: string, rel: string): string {
  return toPosix(path.posix.normalize(path.posix.join(root, rel)));
}
