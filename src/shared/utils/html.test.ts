import { describe, expect, it } from 'vitest';

import { htmlToMarkdown, renderMarkdown, stripHtmlTags } from '$shared/utils/html.js';

describe('htmlToMarkdown', () => {
  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://example.com">click</a>')).toBe(
      '[click](https://example.com)'
    );
  });

  it('converts bold and italic', () => {
    expect(htmlToMarkdown('<strong>bold</strong> and <em>italic</em>')).toBe(
      '**bold** and *italic*'
    );
  });

  it('converts br to newline', () => {
    expect(htmlToMarkdown('line1<br>line2')).toBe('line1\nline2');
  });

  it('strips CDATA markers', () => {
    expect(htmlToMarkdown('<![CDATA[hello world]]>')).toBe('hello world');
  });

  it('decodes XML entities before converting', () => {
    expect(htmlToMarkdown('&lt;p&gt;text&lt;/p&gt;')).toBe('text');
  });

  it('converts list items', () => {
    expect(htmlToMarkdown('<li>item one</li><li>item two</li>')).toBe('- item one\n- item two');
  });
});

describe('renderMarkdown', () => {
  it('converts links to anchor tags', () => {
    const result = renderMarkdown('[click](https://example.com)');
    expect(result).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a>'
    );
  });

  it('does not double-encode & in URLs', () => {
    const result = renderMarkdown('[video](https://example.com/watch?v=abc&t=42)');
    expect(result).toContain('href="https://example.com/watch?v=abc&amp;t=42"');
    expect(result).not.toContain('&amp;amp;');
  });

  it('preserves & in URL with multiple params', () => {
    const result = renderMarkdown('[link](https://x.com?a=1&b=2&c=3)');
    expect(result).toContain('href="https://x.com?a=1&amp;b=2&amp;c=3"');
    expect(result).not.toContain('&amp;amp;');
  });

  it('escapes & in plain text correctly', () => {
    const result = renderMarkdown('A & B');
    expect(result).toBe('A &amp; B');
  });

  it('escapes < and > in plain text', () => {
    const result = renderMarkdown('a < b > c');
    expect(result).toBe('a &lt; b &gt; c');
  });

  it('converts bold syntax', () => {
    expect(renderMarkdown('**bold**')).toBe('<strong>bold</strong>');
  });

  it('converts italic syntax', () => {
    expect(renderMarkdown('*italic*')).toBe('<em>italic</em>');
  });

  it('converts newlines to br', () => {
    expect(renderMarkdown('line1\nline2')).toBe('line1<br>line2');
  });

  it('converts list items', () => {
    expect(renderMarkdown('- item')).toBe('<li>item</li>');
  });

  it('blocks javascript: URLs', () => {
    const result = renderMarkdown('[xss](javascript:alert(1))');
    expect(result).not.toContain('href');
    expect(result).not.toContain('javascript:');
  });

  it('escapes HTML in link text', () => {
    const result = renderMarkdown('[<script>](https://example.com)');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });
});

describe('stripHtmlTags', () => {
  it('should strip HTML tags from text', () => {
    expect(stripHtmlTags('<b>bold</b> text')).toBe('bold text');
  });

  it('should decode HTML entities', () => {
    expect(stripHtmlTags('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('should strip XSS payloads', () => {
    expect(stripHtmlTags('<img src=x onerror="alert(1)">My Podcast')).toBe('My Podcast');
  });

  it('should handle CDATA wrappers', () => {
    expect(stripHtmlTags('<![CDATA[My Title]]>')).toBe('My Title');
  });

  it('should return empty string for empty input', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('should preserve plain text', () => {
    expect(stripHtmlTags('Hello World')).toBe('Hello World');
  });

  it('should strip entity-encoded HTML tags', () => {
    expect(stripHtmlTags('&lt;script&gt;alert(1)&lt;/script&gt;Safe')).toBe('alert(1)Safe');
  });
});
