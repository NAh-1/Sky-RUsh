import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  cacheLeaderboard,
  loadLeaderboard,
  type LeaderboardEntry,
  type RunSummary,
} from '../types/game';

const LEADERBOARD_COLLECTION = 'leaderboard';

function sanitizeArcadeName(rawName: string): string {
  const cleaned = rawName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, 12);
  return cleaned || 'PILOT';
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Real-time global Top 10 leaderboard listener backed by Cloud Firestore.
 * Uses `where('score', '>=', 0)` to satisfy security rules query invariants.
 */
export function subscribeGlobalLeaderboard(
  onUpdate: (entries: LeaderboardEntry[]) => void
): () => void {
  const q = query(
    collection(db, LEADERBOARD_COLLECTION),
    where('score', '>=', 0),
    orderBy('score', 'desc'),
    limit(10)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: LeaderboardEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: typeof data.name === 'string' ? data.name : 'PILOT',
          score: typeof data.score === 'number' ? data.score : 0,
          altitude: typeof data.altitude === 'number' ? data.altitude : 0,
          coins: typeof data.coins === 'number' ? data.coins : 0,
          date: typeof data.date === 'string' ? data.date : '',
        };
      });
      cacheLeaderboard(entries);
      onUpdate(entries);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (/permission|insufficient/i.test(msg)) {
        handleFirestoreError(error, OperationType.LIST, LEADERBOARD_COLLECTION);
      } else {
        // Offline / transient network fallback: keep local cache
        onUpdate(loadLeaderboard());
      }
    }
  );
}

/**
 * Saves a player's score to the global Firestore leaderboard immediately
 * (with strict schema sanitization matching firebase-blueprint.json) and returns
 * the optimistic Top 10 ranking right away for snappy kiosk flow.
 */
export function submitGlobalScore(
  rawName: string,
  summary: RunSummary,
  currentEntries: LeaderboardEntry[]
): { entries: LeaderboardEntry[]; rank: number; savedId: string } {
  const cleanName = sanitizeArcadeName(rawName);
  const safeScore = clampInt(summary.score, 0, 10000000);
  const safeAltitude = clampInt(summary.altitude, 0, 1000000);
  const safeCoins = clampInt(summary.coins, 0, 100000);
  const safeDate = new Date().toISOString().slice(0, 10);
  const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const entry: LeaderboardEntry = {
    id: docId,
    name: cleanName,
    score: safeScore,
    altitude: safeAltitude,
    coins: safeCoins,
    date: safeDate,
  };

  const next = [...currentEntries, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  cacheLeaderboard(next);
  const rank = next.findIndex((e) => e.id === docId) + 1;

  const docPath = `${LEADERBOARD_COLLECTION}/${docId}`;
  void setDoc(doc(db, LEADERBOARD_COLLECTION, docId), {
    name: cleanName,
    score: safeScore,
    altitude: safeAltitude,
    coins: safeCoins,
    date: safeDate,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (/permission|insufficient/i.test(msg)) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } else {
      console.warn('Offline or transient error saving global score:', error);
    }
  });

  return { entries: next, rank, savedId: docId };
}
