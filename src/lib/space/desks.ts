import { TEAM_MAP, deskSpots } from "./map";

export const MAX_DESKS = deskSpots(TEAM_MAP).length;

// Desk index per member by join time (then user id); members past the last desk get null and start at the entrance.
export function assignDesks(members: { userId: string; joinedAt: Date }[]): Map<string, number | null> {
  const sorted = [...members].sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId),
  );
  return new Map(sorted.map((m, i) => [m.userId, i < MAX_DESKS ? i : null]));
}
