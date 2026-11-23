import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { findExternalReferences } from '../../scripts/check-offline';

it('finds resources loaded from outside and ignores plain text URLs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-'));
  writeFileSync(join(dir, 'index.html'), '<link rel="stylesheet" href="https://cdn.example/a.css"><script src="/assets/app.js"></script><a>http://www.w3.org/2000/svg</a>');
  writeFileSync(join(dir, 'a.css'), '@font-face{src:url(https://cdn.example/f.woff2)} .x{background:url(/local.png)}');
  writeFileSync(join(dir, 'app.js'), 'const ns="http://www.w3.org/2000/svg";');
  expect(findExternalReferences(dir).map((r) => r.file).sort()).toEqual(['a.css', 'index.html']);
});

it('also catches protocol-relative links and remote imports, in nested folders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-'));
  writeFileSync(join(dir, 'index.html'), '<link rel="stylesheet" href="//cdn.example/a.css">');
  writeFileSync(join(dir, 'b.css'), '@import "https://fonts.example/css";');
  expect(findExternalReferences(dir).map((r) => r.file).sort()).toEqual(['b.css', 'index.html']);
  const clean = mkdtempSync(join(tmpdir(), 'offline-'));
  writeFileSync(join(clean, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
  expect(findExternalReferences(clean)).toEqual([]);
});
