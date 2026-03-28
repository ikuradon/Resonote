import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const buildDir = getArgValue('--dir') ?? '.svelte-kit/cloudflare';

function getArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function walk(dir) {
  const entries = readdirSync(dir).sort();
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }
    files.push(path);
  }

  return files;
}

function classify(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.js') return 'js';
  if (ext === '.css') return 'css';
  if (ext === '.html') return 'html';
  if (ext === '.json') return 'json';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) {
    return 'image';
  }
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
    return 'font';
  }
  return 'other';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function summarizeByKind(records) {
  const summary = new Map();
  for (const record of records) {
    const current = summary.get(record.kind) ?? { raw: 0, gzip: 0, count: 0 };
    current.raw += record.rawSize;
    current.gzip += record.gzipSize;
    current.count += 1;
    summary.set(record.kind, current);
  }
  return [...summary.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const files = walk(buildDir);
const records = files.map((path) => {
  const buffer = readFileSync(path);
  return {
    path: relative(buildDir, path),
    kind: classify(path),
    rawSize: buffer.byteLength,
    gzipSize: gzipSync(buffer).byteLength
  };
});

const totalRaw = records.reduce((sum, record) => sum + record.rawSize, 0);
const totalGzip = records.reduce((sum, record) => sum + record.gzipSize, 0);
const largest = [...records].sort((a, b) => b.rawSize - a.rawSize).slice(0, 15);

console.log(`Bundle directory: ${buildDir}`);
console.log(`Files: ${records.length}`);
console.log(`Total raw: ${formatSize(totalRaw)}`);
console.log(`Total gzip: ${formatSize(totalGzip)}`);
console.log('');
console.log('By kind:');
for (const [kind, entry] of summarizeByKind(records)) {
  console.log(
    `- ${kind}: ${entry.count} files, ${formatSize(entry.raw)} raw, ${formatSize(entry.gzip)} gzip`
  );
}

console.log('');
console.log('Largest files:');
for (const record of largest) {
  console.log(
    `- ${record.path}: ${formatSize(record.rawSize)} raw, ${formatSize(record.gzipSize)} gzip`
  );
}

if (!summaryOnly) {
  console.log('');
  console.log('All files:');
  for (const record of [...records].sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(
      `- ${record.path}: ${formatSize(record.rawSize)} raw, ${formatSize(record.gzipSize)} gzip`
    );
  }
}
