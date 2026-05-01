import { describe, expect, it } from 'vitest';

import {
  buildNipC0CodeSnippet,
  buildNipC0CodeSnippetFilter,
  buildNipC0DependencyTag,
  buildNipC0ExtensionTag,
  buildNipC0LanguageTag,
  isNipC0CodeSnippetKind,
  NIPC0_CODE_SNIPPET_KIND,
  parseNipC0CodeSnippet
} from './index.js';

describe('NIP-C0 code snippets', () => {
  it('builds kind:1337 snippet events while preserving code whitespace', () => {
    const code = "function helloWorld() {\n  console.log('Hello, Nostr!');\n}\n\nhelloWorld();\n";
    const event = buildNipC0CodeSnippet({
      code,
      language: 'JavaScript',
      name: 'hello-world.js',
      extension: '.JS',
      description: 'A basic JavaScript function',
      runtime: 'node v18.15.0',
      license: 'MIT',
      dependencies: ['typescript', ' vitest '],
      repo: 'https://github.com/nostr-protocol/nostr',
      tags: [
        ['l', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIPC0_CODE_SNIPPET_KIND,
      content: code,
      tags: [
        ['l', 'javascript'],
        ['name', 'hello-world.js'],
        ['extension', 'js'],
        ['description', 'A basic JavaScript function'],
        ['runtime', 'node v18.15.0'],
        ['license', 'MIT'],
        ['dep', 'typescript'],
        ['dep', 'vitest'],
        ['repo', 'https://github.com/nostr-protocol/nostr'],
        ['client', 'resonote']
      ]
    });
  });

  it('parses snippet metadata and repeated dependencies', () => {
    const event = buildNipC0CodeSnippet({
      code: 'fn main() {}\n',
      language: 'rust',
      name: 'main.rs',
      extension: 'rs',
      description: 'Minimal Rust main',
      runtime: 'rustc 1.78',
      license: 'Apache-2.0',
      dependencies: ['serde', 'tokio'],
      repo: 'https://example.com/repo',
      tags: [['client', 'resonote']]
    });

    expect(
      parseNipC0CodeSnippet({
        ...event,
        pubkey: 'author',
        created_at: 123,
        id: 'event-id'
      })
    ).toEqual({
      kind: NIPC0_CODE_SNIPPET_KIND,
      code: 'fn main() {}\n',
      language: 'rust',
      name: 'main.rs',
      extension: 'rs',
      description: 'Minimal Rust main',
      runtime: 'rustc 1.78',
      license: 'Apache-2.0',
      dependencies: ['serde', 'tokio'],
      repo: 'https://example.com/repo',
      customTags: [['client', 'resonote']],
      pubkey: 'author',
      createdAt: 123,
      id: 'event-id'
    });
  });

  it('rejects blank code and non-snippet events', () => {
    expect(() => buildNipC0CodeSnippet({ code: '   ' })).toThrow(/code content/);
    expect(parseNipC0CodeSnippet({ kind: 1, content: 'const x = 1;', tags: [] })).toBeNull();
    expect(
      parseNipC0CodeSnippet({ kind: NIPC0_CODE_SNIPPET_KIND, content: '', tags: [] })
    ).toBeNull();
  });

  it('builds metadata tags and language relay filters', () => {
    expect(isNipC0CodeSnippetKind(1337)).toBe(true);
    expect(isNipC0CodeSnippetKind(1)).toBe(false);
    expect(buildNipC0LanguageTag('TypeScript')).toEqual(['l', 'typescript']);
    expect(buildNipC0ExtensionTag('.TS')).toEqual(['extension', 'ts']);
    expect(buildNipC0DependencyTag('  @nostr/tools  ')).toEqual(['dep', '@nostr/tools']);
    expect(
      buildNipC0CodeSnippetFilter({
        languages: ['JavaScript', 'RUST'],
        authors: [' author '],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIPC0_CODE_SNIPPET_KIND],
      '#l': ['javascript', 'rust'],
      authors: ['author'],
      since: 10,
      until: 20,
      limit: 5
    });
  });
});
