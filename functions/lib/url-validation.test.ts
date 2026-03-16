import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from './url-validation.js';

describe('assertSafeUrl', () => {
  it('should allow valid public URLs', () => {
    expect(() => assertSafeUrl('https://example.com/feed.xml')).not.toThrow();
    expect(() => assertSafeUrl('https://feeds.megaphone.fm/podcast')).not.toThrow();
    expect(() => assertSafeUrl('http://example.com/audio.mp3')).not.toThrow();
  });

  it('should block private IPv4 addresses', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/secret')).toThrow('blocked');
    expect(() => assertSafeUrl('http://10.0.0.1/internal')).toThrow('blocked');
    expect(() => assertSafeUrl('http://192.168.1.1/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.16.0.1/data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.31.255.255/data')).toThrow('blocked');
  });

  it('should allow non-private 172.x addresses', () => {
    expect(() => assertSafeUrl('http://172.32.0.1/data')).not.toThrow();
    expect(() => assertSafeUrl('http://172.15.0.1/data')).not.toThrow();
  });

  it('should block link-local addresses', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://169.254.1.1/')).toThrow('blocked');
  });

  it('should block localhost variants', () => {
    expect(() => assertSafeUrl('http://localhost/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://0.0.0.0/')).toThrow('blocked');
  });

  it('should block IPv6 loopback and private', () => {
    expect(() => assertSafeUrl('http://[::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fc00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fd00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fe80::1]/')).toThrow('blocked');
  });

  it('should block non-http(s) protocols', () => {
    expect(() => assertSafeUrl('ftp://example.com/file')).toThrow('blocked');
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow('blocked');
    expect(() => assertSafeUrl('javascript:alert(1)')).toThrow('blocked');
  });

  it('should allow domain names that start with private IP octets', () => {
    expect(() => assertSafeUrl('http://10.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://127.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://192.168.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://172.16.example.com/')).not.toThrow();
  });

  it('should throw on invalid URLs', () => {
    expect(() => assertSafeUrl('not-a-url')).toThrow();
  });
});
