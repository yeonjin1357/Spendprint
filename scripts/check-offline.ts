/**
 * Makes sure the built web app loads nothing from the network: no remote scripts, styles, fonts or images.
 *   npm run check:offline
 * A URL that merely appears as text (an SVG namespace, an error link inside a bundle) is not a request and is ignored.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTE = String.raw`(?:https?:)?\/\/`;
const HTML_PATTERNS = [new RegExp(String.raw`(?:src|href)\s*=\s*["']${REMOTE}[^"']*`, 'gi')];
const CSS_JS_PATTERNS = [
  new RegExp(String.raw`url\(\s*["']?${REMOTE}[^)"']*`, 'gi'),
  new RegExp(String.raw`@import\s+(?:url\(\s*)?["']${REMOTE}[^"']*`, 'gi'),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function findExternalReferences(dir: string): { file: string; match: string }[] {
  const found: { file: string; match: string }[] = [];
  for (const path of walk(dir)) {
    const ext = extname(path).toLowerCase();
    const patterns = ext === '.html' ? [...HTML_PATTERNS, ...CSS_JS_PATTERNS] : ext === '.css' || ext === '.js' ? CSS_JS_PATTERNS : [];
    if (patterns.length === 0) continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of patterns) {
      for (const m of text.matchAll(pattern)) found.push({ file: relative(dir, path).replace(/\\/g, '/'), match: m[0].slice(0, 120) });
    }
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist/web');
  if (!existsSync(dir)) {
    console.error(`${dir} 폴더가 없어요. 먼저 npm run build를 실행해 주세요.`);
    process.exit(1);
  }
  const found = findExternalReferences(dir);
  if (found.length > 0) {
    console.error('바깥에서 불러오는 자원이 있어요:');
    for (const f of found) console.error(`  ${f.file}: ${f.match}`);
    process.exit(1);
  }
  console.log('바깥에서 불러오는 자원이 없어요.');
}
