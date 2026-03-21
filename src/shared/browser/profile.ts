// @public — Stable API for route/component/feature consumers
/**
 * Profile state bridge — re-exports for route/component access.
 */
export {
  getProfile,
  getProfileDisplay,
  getDisplayName,
  fetchProfile,
  fetchProfiles,
  clearProfiles
} from './profile.svelte.js';
export type { Profile, ProfileDisplay } from '../../features/profiles/domain/profile-model.js';
export {
  describeProfileDisplay,
  formatNip05,
  getProfileHref,
  truncateProfileName as truncate,
  formatDisplayName
} from '../../features/profiles/domain/profile-model.js';
