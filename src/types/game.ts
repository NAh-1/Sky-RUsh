export type GamePhase = 'attract' | 'playing' | 'gameover';

export type CameraStatus =
  | 'initializing'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error';

export type PowerUpType = 'shield' | 'magnet' | 'thermal';
export type HazardType = 'mine' | 'storm' | 'bird' | 'gust';

export type SkyLane = -1 | 0 | 1;

export interface LeanInputState {
  /** Continuous head horizontal offset (-1 = full left, +1 = full right) */
  x: number;
  /** Legacy vertical axis (kept 0 in 3-lane runner mode) */
  y: number;
  /** Target sky lane (-1 = Left, 0 = Center, 1 = Right) */
  targetLane: SkyLane;
  /** True when burner flame flares (Thermal Updraft or rapid lane dash) */
  burnerOn: boolean;
  /** True when venting (unused in 3-lane mode) */
  venting: boolean;
  /** True when a valid person is locked in the crowd-filtered center zone */
  personDetected: boolean;
  /** True once baseline head center is calibrated */
  calibrated: boolean;
  /** 0..1 progress while holding center stance in Attract Mode (1.5s to start) */
  readyProgress: number;
  /** Shoulder/head scale normalized [0..1] for crowd-lock feedback */
  trackedSpan: number;
  /** Total detected people in frame before crowd filtering */
  peopleCount: number;
}

export interface HudSnapshot {
  score: number;
  altitude: number;
  speedKmh: number;
  coins: number;
  combo: number;
  comboTimer: number;
  shieldActive: boolean;
  magnetTimer: number;
  thermalTimer: number;
  nearHazard: boolean;
  eventBanner: string | null;
  eventTone: 'gold' | 'cyan' | 'amber' | 'rose';
}

export interface RunSummary {
  score: number;
  altitude: number;
  coins: number;
  maxCombo: number;
  reason: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  altitude: number;
  coins: number;
  date: string;
}

const LEADERBOARD_KEY = 'sky_rush_leaderboard_v2';

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.score === 'number' &&
          typeof item.name === 'string' &&
          !String(item.id || '').startsWith('seed-')
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function cacheLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 10)));
  } catch {
    // Ignore storage quota errors in kiosk private mode
  }
}

export function previewPotentialRank(
  score: number,
  currentEntries: LeaderboardEntry[] = loadLeaderboard()
): number {
  const rounded = Math.round(score);
  let idx = currentEntries.findIndex((e) => rounded > e.score);
  if (idx === -1) idx = currentEntries.length;
  return idx < 10 ? idx + 1 : 0;
}

export function saveLeaderboardEntry(
  name: string,
  summary: RunSummary
): { entries: LeaderboardEntry[]; rank: number; savedId: string } {
  const cleanName = name.trim().toUpperCase().slice(0, 12) || 'PILOT';
  const entries = loadLeaderboard();
  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    score: Math.round(summary.score),
    altitude: Math.round(summary.altitude),
    coins: Math.round(summary.coins),
    date: new Date().toISOString().slice(0, 10),
  };

  const next = [...entries, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  cacheLeaderboard(next);

  const rank = next.findIndex((e) => e.id === entry.id) + 1;
  return { entries: next, rank, savedId: entry.id };
}
