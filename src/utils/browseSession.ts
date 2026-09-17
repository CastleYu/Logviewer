import { normalizeRemotePath } from './browsePath';
import type { BrowseEntry } from './browseCommands';

export interface BrowseListing {
  path: string;
  entries: BrowseEntry[];
}

export interface BrowseSession {
  profileId: string;
  path: string;
  listing: BrowseListing | null;
  visible: boolean;
  listCalls: number;
  x: number;
  y: number;
}

export function createBrowseSession(profileId: string, path: string, position?: { x: number; y: number }): BrowseSession {
  return {
    profileId,
    path: normalizeRemotePath(path),
    listing: null,
    visible: true,
    listCalls: 0,
    x: position?.x ?? 48,
    y: position?.y ?? 88,
  };
}

export function hideBrowseWindow(session: BrowseSession): BrowseSession {
  return { ...session, visible: false };
}

export function showBrowseWindow(session: BrowseSession): BrowseSession {
  return { ...session, visible: true };
}

export function moveBrowseWindow(session: BrowseSession, x: number, y: number): BrowseSession {
  return { ...session, x, y };
}

export function needsRemoteList(session: BrowseSession, requestedPath = session.path): boolean {
  if (!session.profileId) return false;
  const path = normalizeRemotePath(requestedPath);
  return !session.listing || session.listing.path !== path;
}

export function rememberListing(session: BrowseSession, listing: BrowseListing): BrowseSession {
  return {
    ...session,
    path: normalizeRemotePath(listing.path),
    listing: { path: normalizeRemotePath(listing.path), entries: listing.entries },
    listCalls: session.listCalls + 1,
  };
}

export function setBrowsePath(session: BrowseSession, path: string): BrowseSession {
  return { ...session, path: normalizeRemotePath(path) };
}

export function setBrowseProfile(session: BrowseSession, profileId: string, path: string): BrowseSession {
  if (session.profileId === profileId && session.path === normalizeRemotePath(path)) return session;
  return {
    ...session,
    profileId,
    path: normalizeRemotePath(path),
    listing: session.profileId === profileId && session.listing?.path === normalizeRemotePath(path) ? session.listing : null,
  };
}
