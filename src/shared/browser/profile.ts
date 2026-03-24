// @public — Stable API for route/component/feature consumers
/**
 * Profile state bridge — re-exports for route/component access.
 */
export {
  clearProfiles,
  fetchProfile,
  fetchProfiles,
  getDisplayName,
  getProfile,
  getProfileDisplay
} from './profile.svelte.js';
export type { Profile, ProfileDisplay } from '$features/profiles/domain/profile-model.js';
export {
  describeProfileDisplay,
  formatDisplayName,
  formatNip05,
  getProfileHref,
  truncateProfileName as truncate
} from '$features/profiles/domain/profile-model.js';
