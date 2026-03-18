/**
 * Lightweight HTTP mock server for E2E tests.
 * Serves test fixtures so Pages Functions can fetch from localhost.
 */

import { createServer, type Server } from 'node:http';
import { rssFeedXml, htmlWithRss, HTML_NO_RSS, buildId3v2Binary } from './fixtures.js';

export interface MockServer {
  url: string;
  close: () => Promise<void>;
}

export async function startMockServer(): Promise<MockServer> {
  let serverUrl = '';
  const audioBinary = buildId3v2Binary();

  const server: Server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', `http://localhost`).pathname;

    switch (pathname) {
      case '/feed.xml':
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
        res.end(rssFeedXml(serverUrl));
        break;

      case '/site-with-rss':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlWithRss(serverUrl));
        break;

      case '/audio.mp3':
        // Support Range requests like the real fetchAudioMetadata does
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(audioBinary.length),
          'Accept-Ranges': 'bytes'
        });
        res.end(audioBinary);
        break;

      case '/site-no-rss':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HTML_NO_RSS);
        break;

      default:
        // Also serve feed.xml for domain root RSS discovery
        if (pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(htmlWithRss(serverUrl));
          break;
        }
        res.writeHead(404);
        res.end('Not Found');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        url: serverUrl,
        close: () => new Promise<void>((r) => server.close(() => r()))
      });
    });
  });
}
