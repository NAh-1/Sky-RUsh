# Security Specification — SKY RUSH Global Leaderboard

## 1. Data Invariants
1. Every document in `/leaderboard/{entryId}` represents an immutable public arcade score (no PII: no email, phone, or auth credentials).
2. `entryId` must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
3. Document keys must strictly equal `['name', 'score', 'altitude', 'coins', 'date', 'createdAt']` (no extra/shadow fields).
4. `name` must be 1–12 uppercase alphanumeric/space characters (`^[A-Z0-9 ]+$`).
5. `score` must be numeric between `0` and `10000000`; `altitude` between `0` and `1000000`; `coins` between `0` and `100000`.
6. `date` must match `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` (length 10).
7. `createdAt` must equal server `request.time`.
8. Existing leaderboard documents cannot be updated or deleted from client SDKs (`allow update, delete: if false`).

## 2. The "Dirty Dozen" Attack Payloads
1. Shadow field injection (`{ ..., isVerified: true }`) -> DENIED (`hasOnly` check).
2. Missing required field (`{ name: "ACE", score: 500 }`) -> DENIED (`hasAll` check).
3. Client-forged timestamp (`{ ..., createdAt: "2020-01-01T00:00:00Z" }`) -> DENIED (`createdAt == request.time`).
4. Oversized player name (`{ ..., name: "ABCDEFGHIJKLMNO" }`) -> DENIED (`size() <= 12`).
5. Empty player name (`{ ..., name: "" }`) -> DENIED (`size() >= 1`).
6. HTML/script injection in name (`{ ..., name: "<SCRIPT>" }`) -> DENIED (`matches('^[A-Z0-9 ]+$')`).
7. Negative score (`{ ..., score: -500 }`) -> DENIED (`score >= 0`).
8. Overflow score (`{ ..., score: 999999999 }`) -> DENIED (`score <= 10000000`).
9. Type confusion on score (`{ ..., score: "9999" }`) -> DENIED (`score is int || score is float`).
10. Invalid document ID (`leaderboard/../../etc/passwd` or >128 chars) -> DENIED (`isValidId`).
11. Score tampering via update (`updateDoc` changing `score`) -> DENIED (`allow update: if false`).
12. Score deletion (`deleteDoc`) -> DENIED (`allow delete: if false`).
