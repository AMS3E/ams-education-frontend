export interface ReviveZone {
  zoneId: string;
  id: string;
  width: number;
  height: number;
  title: string;
}

export const revivePortrait: ReviveZone = {
  zoneId: "8",
  id: "d76f006be89744f510aa36ab20de12fc",
  width: 390,
  height: 660,
  title: "Revive ad — portrait",
};

export const reviveLandscapeShort: ReviveZone = {
  zoneId: "6",
  id: "d76f006be89744f510aa36ab20de12fc",
  width: 640,
  height: 400,
  title: "Revive ad — half landscape (short)",
};

/** Half landscape 920×570 — same slot shape as `kbPrasacHalfLandscape` (see
 *  `@/lib/promos`). */
export const reviveHalfLandscape: ReviveZone = {
  zoneId: "7",
  id: "d76f006be89744f510aa36ab20de12fc",
  width: 920,
  height: 570,
  title: "Revive ad — half landscape",
};

export const reviveFullLandscape: ReviveZone = {
  zoneId: "5",
  id: "d76f006be89744f510aa36ab20de12fc",
  width: 1920,
  height: 800,
  title: "Revive ad — full landscape",
};
