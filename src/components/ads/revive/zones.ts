export interface ReviveZone {
  zoneId: string;
  id: string;
  width: number;
  height: number;
  title: string;
}

export const revivePortrait: ReviveZone = {
  zoneId: "8",
  id: "55aa4b5dd75ab774bd198a60f6c237bc",
  width: 390,
  height: 660,
  title: "Revive ad — portrait",
};

export const reviveLandscapeShort: ReviveZone = {
  zoneId: "6",
  id: "55aa4b5dd75ab774bd198a60f6c237bc",
  width: 640,
  height: 400,
  title: "Revive ad — half landscape (short)",
};

/** Half landscape 920×570 — same slot shape as `kbPrasacHalfLandscape` (see
 *  `@/lib/promos`). */
export const reviveHalfLandscape: ReviveZone = {
  zoneId: "7",
  id: "55aa4b5dd75ab774bd198a60f6c237bc",
  width: 920,
  height: 570,
  title: "Revive ad — half landscape",
};

export const reviveFullLandscape: ReviveZone = {
  zoneId: "5",
  id: "55aa4b5dd75ab774bd198a60f6c237bc",
  width: 1920,
  height: 800,
  title: "Revive ad — full landscape",
};
