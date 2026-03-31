/**
 * Content resolution orchestrator.
 * Extracts podcast/audio resolution logic from the route component.
 *
 * Three resolution paths:
 * 1. podcast:episode — resolve via episode-resolver (Nostr + API parallel)
 * 2. audio — decode base64url to get direct URL, then discover podcast guid
 * 3. other platforms — no resolution needed
 */

import {
  buildEpisodeContentId,
  resolveByApi,
  resolveEpisode,
  searchBookmarkByUrl
} from '$shared/content/resolution.js';
import { fromBase64url, toBase64url } from '$shared/content/url-utils.js';
import { publishSignedEvents } from '$shared/nostr/publish-signed.js';
import { createLogger } from '$shared/utils/logger.js';

import type { EpisodeMetadata, ResolutionResult } from '../domain/resolution-result.js';
import { emptyResult } from '../domain/resolution-result.js';

const log = createLogger('resolve-content');

/**
 * Resolve a podcast episode content ID.
 * The contentIdParam is "feedBase64:guidBase64".
 */
export async function resolvePodcastEpisode(contentIdParam: string): Promise<ResolutionResult> {
  const parts = contentIdParam.split(':');
  if (parts.length !== 2) return emptyResult();

  const info = await resolveEpisode(parts[0], parts[1]);
  if (!info) return emptyResult();

  return {
    metadata: {
      title: info.title,
      feedTitle: info.feedTitle,
      image: info.image,
      description: info.description,
      enclosureUrl: info.enclosureUrl
    },
    additionalSubscriptions: [`audio:${info.enclosureUrl}`],
    signedEvents: []
  };
}

/**
 * Resolve an audio direct URL to discover its podcast identity.
 * Fallback chain: Nostr bookmark → API auto-discovery.
 */
export async function resolveAudioUrl(
  contentIdParam: string,
  signal?: { cancelled: boolean }
): Promise<ResolutionResult> {
  const audioUrl = fromBase64url(contentIdParam);
  if (!audioUrl) {
    return {
      ...emptyResult(),
      metadata: { enclosureUrl: undefined }
    };
  }

  const result: ResolutionResult = {
    metadata: { enclosureUrl: audioUrl },
    additionalSubscriptions: [],
    signedEvents: []
  };

  try {
    // Step 1: Search Nostr relays for existing bookmark
    const bookmark = await searchBookmarkByUrl(audioUrl);
    if (signal?.cancelled) return result;

    if (bookmark) {
      return await applyBookmarkResolution(bookmark, result, signal);
    }

    // Step 2: Fallback to API auto-discovery
    return await applyApiResolution(audioUrl, result, signal);
  } catch (err) {
    log.error('Audio resolution failed', err);
    return result;
  }
}

async function applyBookmarkResolution(
  bookmark: { guid: string; feedUrl: string },
  result: ResolutionResult,
  signal?: { cancelled: boolean }
): Promise<ResolutionResult> {
  const episodeContentId = buildEpisodeContentId(bookmark.feedUrl, bookmark.guid);

  result.additionalSubscriptions.push(`podcast:item:guid:${bookmark.guid}`);
  result.resolvedPath = `/podcast/episode/${episodeContentId.id}`;

  // Also fetch metadata via episode-resolver
  const feedBase64 = toBase64url(bookmark.feedUrl);
  const guidBase64 = toBase64url(bookmark.guid);
  try {
    const info = await resolveEpisode(feedBase64, guidBase64);
    if (!signal?.cancelled && info) {
      result.metadata = mergeMetadata(result.metadata, {
        title: info.title,
        feedTitle: info.feedTitle,
        image: info.image,
        description: info.description
      });
    }
  } catch {
    // Metadata fetch is best-effort
  }

  return result;
}

async function applyApiResolution(
  audioUrl: string,
  result: ResolutionResult,
  signal?: { cancelled: boolean }
): Promise<ResolutionResult> {
  const data = await resolveByApi(audioUrl);
  if (signal?.cancelled) return result;

  // Extract metadata from API response
  if (data.episode?.title)
    result.metadata = mergeMetadata(result.metadata, { title: data.episode.title });
  if (data.episode?.description)
    result.metadata = mergeMetadata(result.metadata, { description: data.episode.description });
  if (data.feed?.title)
    result.metadata = mergeMetadata(result.metadata, { feedTitle: data.feed.title });
  if (data.feed?.imageUrl)
    result.metadata = mergeMetadata(result.metadata, { image: data.feed.imageUrl });

  // Fallback to audio file metadata (ID3 tags etc.)
  if (data.metadata) {
    if (data.metadata.title)
      result.metadata = mergeMetadata(result.metadata, { title: data.metadata.title });
    if (data.metadata.artist)
      result.metadata = mergeMetadata(result.metadata, { feedTitle: data.metadata.artist });
    if (data.metadata.image)
      result.metadata = mergeMetadata(result.metadata, { image: data.metadata.image });
  }

  // Publish signed events internally (no need for route to handle this)
  if (data.signedEvents && data.signedEvents.length > 0) {
    publishSignedEvents(data.signedEvents).catch((e) =>
      log.error('Failed to publish signed events', e)
    );
  }

  // Podcast resolution (guid discovery)
  if (data.episode?.guid && data.feed?.feedUrl) {
    const episodeContentId = buildEpisodeContentId(data.feed.feedUrl, data.episode.guid);
    result.resolvedPath = `/podcast/episode/${episodeContentId.id}`;
    result.additionalSubscriptions.push(`podcast:item:guid:${data.episode.guid}`);
  } else if (data.episode?.guid) {
    result.additionalSubscriptions.push(`podcast:item:guid:${data.episode.guid}`);
  }

  return result;
}

/** Merge metadata without overwriting existing values. Returns a new object. */
function mergeMetadata(target: EpisodeMetadata, source: Partial<EpisodeMetadata>): EpisodeMetadata {
  return {
    ...target,
    title: target.title || source.title,
    feedTitle: target.feedTitle || source.feedTitle,
    image: target.image || source.image,
    description: target.description || source.description,
    enclosureUrl: target.enclosureUrl || source.enclosureUrl
  };
}
