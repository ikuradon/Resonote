#!/usr/bin/env node
/**
 * Batch migration: Convert HTML descriptions in kind:39701 bookmark events to Markdown.
 *
 * Usage: node scripts/migrate-bookmark-descriptions.mjs
 *
 * Reads SYSTEM_NOSTR_PRIVKEY from .dev.vars, fetches all kind:39701 events
 * from production relays, converts HTML content to Markdown, and re-publishes.
 */

import { readFileSync } from 'fs';
import { finalizeEvent,getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import { WebSocket } from 'ws';

// --- Config ---
const RELAYS = [
  'wss://relay.damus.io',
  'wss://yabu.me',
  'wss://nos.lol',
  'wss://relay.nostr.wirednet.jp'
];
const KIND = 39701;

// --- Load privkey from .dev.vars ---
const devVars = readFileSync('.dev.vars', 'utf8');
const privkeyHex = devVars.match(/SYSTEM_NOSTR_PRIVKEY=(\w+)/)?.[1];
if (!privkeyHex) {
  console.error('SYSTEM_NOSTR_PRIVKEY not found in .dev.vars');
  process.exit(1);
}
const privkey = hexToBytes(privkeyHex);
const pubkey = getPublicKey(privkey);
console.log(`System pubkey: ${pubkey}`);

// --- HTML to Markdown (same logic as src/shared/utils/html.ts) ---
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function htmlToMarkdown(html) {
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|blockquote|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(content) {
  return (
    /<[a-z][^>]*>/i.test(content) || /&(?:lt|gt|amp|quot);/i.test(content) || /\]\]>/.test(content)
  );
}

// --- Relay communication ---
function connectRelay(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error(`Timeout connecting to ${url}`)), 10000);
  });
}

function fetchEvents(ws, filter) {
  return new Promise((resolve) => {
    const subId = `migrate-${  Math.random().toString(36).slice(2, 8)}`;
    const events = [];

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === subId) {
        events.push(msg[2]);
      }
      if (msg[0] === 'EOSE' && msg[1] === subId) {
        ws.send(JSON.stringify(['CLOSE', subId]));
        resolve(events);
      }
    });

    ws.send(JSON.stringify(['REQ', subId, filter]));

    // Timeout after 30s
    setTimeout(() => resolve(events), 30000);
  });
}

function publishEvent(ws, event) {
  return new Promise((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'OK' && msg[1] === event.id) {
        resolve({ ok: msg[2], reason: msg[3] || '' });
      }
    });

    ws.send(JSON.stringify(['EVENT', event]));

    // Timeout after 10s
    setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 10000);
  });
}

// --- Main ---
async function main() {
  // Step 1: Fetch all kind:39701 events from first available relay
  let ws;
  let relayUrl;
  for (const url of RELAYS) {
    try {
      console.log(`Connecting to ${url}...`);
      ws = await connectRelay(url);
      relayUrl = url;
      console.log(`Connected to ${url}`);
      break;
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
    }
  }
  if (!ws) {
    console.error('Could not connect to any relay');
    process.exit(1);
  }

  console.log('Fetching kind:39701 events...');
  const events = await fetchEvents(ws, {
    kinds: [KIND],
    authors: [pubkey],
    limit: 500
  });
  console.log(`Found ${events.length} events`);

  // Step 2: Filter events that need migration (contain HTML in content)
  const toMigrate = events.filter((ev) => ev.content && looksLikeHtml(ev.content));
  console.log(`${toMigrate.length} events need HTML→Markdown migration`);

  if (toMigrate.length === 0) {
    console.log('Nothing to migrate. Done.');
    ws.close();
    return;
  }

  // Step 3: Show preview
  console.log('\n--- Preview (first 3) ---');
  for (const ev of toMigrate.slice(0, 3)) {
    const title = ev.tags.find((t) => t[0] === 'title')?.[1] || '(no title)';
    const md = htmlToMarkdown(ev.content);
    console.log(`\n[${title}]`);
    console.log(`  Before (${ev.content.length} chars): ${ev.content.slice(0, 80)}...`);
    console.log(`  After  (${md.length} chars): ${md.slice(0, 80)}...`);
  }

  console.log(`\nWill re-sign and publish ${toMigrate.length} events.`);
  console.log('Press Ctrl+C to abort. Starting in 3 seconds...');
  await new Promise((r) => setTimeout(r, 3000));

  // Step 4: Re-sign and publish to all relays
  const connections = [];
  for (const url of RELAYS) {
    try {
      if (url === relayUrl) {
        connections.push({ url, ws });
      } else {
        const w = await connectRelay(url);
        connections.push({ url, ws: w });
      }
    } catch (err) {
      console.log(`  Skipping ${url}: ${err.message}`);
    }
  }

  let migrated = 0;
  for (const ev of toMigrate) {
    const md = htmlToMarkdown(ev.content).slice(0, 1000);
    const title = ev.tags.find((t) => t[0] === 'title')?.[1] || '(no title)';

    // Re-sign with same tags but updated content and new timestamp
    const newEvent = finalizeEvent(
      {
        kind: KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: ev.tags,
        content: md
      },
      privkey
    );

    // Publish to all connected relays
    for (const conn of connections) {
      try {
        const result = await publishEvent(conn.ws, newEvent);
        if (result.ok) {
          console.log(`  ✓ [${conn.url}] ${title}`);
        } else {
          console.log(`  ✗ [${conn.url}] ${title}: ${result.reason}`);
        }
      } catch (err) {
        console.log(`  ✗ [${conn.url}] ${title}: ${err.message}`);
      }
    }
    migrated++;
  }

  console.log(`\nMigrated ${migrated}/${toMigrate.length} events.`);

  // Cleanup
  for (const conn of connections) {
    conn.ws.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
