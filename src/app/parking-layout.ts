/**
 * FLOOR COORDINATES
 * -----------------
 * All floors share one plan. Units are metres.
 * Origin (0,0) is the back-left corner of the floor, x runs left to right, y runs back to front.
 *
 *   y=0   ┌──────────────────────────────────────────────────────────┐
 *         │  Row A  (slots, y 1–6)                                   │
 *   y=9   │  Lane 1 (driving lane)   ← Entry / Exit gate at x=0      │  ramp
 *         │  Row B  (slots, y 12–17)                     cross lane  │  x 51–58
 *         │  Row C  (slots, y 17–22)                     x = 47.3    │
 *   y=25  │  Lane 2 (driving lane)                                   │
 *         │  Row D  (slots, y 28–33)                                 │
 *   y=34  └──────────────────────────────────────────────────────────┘
 */

export const FLOOR_W = 60;
export const FLOOR_D = 34;
export const FLOOR_GAP = 6.5; // height between two floors
export const SLAB_T = 0.5; // thickness of a floor slab

export interface FloorInfo {
  index: number;
  code: string;
  name: string;
}

export const FLOORS: FloorInfo[] = [
  { index: 0, code: 'G', name: 'Ground floor' },
  { index: 1, code: 'L1', name: 'Level 1' },
  { index: 2, code: 'L2', name: 'Level 2' },
];

export type RowId = 'A' | 'B' | 'C' | 'D';

export const SLOT_W = 2.6;
export const SLOT_D = 5;
export const SLOTS_PER_ROW = 16;
export const SLOT_X0 = 2;

/** Slot rows: y0..y1 is the depth of the row on the plan. */
export const ROWS: Record<RowId, { y0: number; y1: number }> = {
  A: { y0: 1, y1: 6 },
  B: { y0: 12, y1: 17 },
  C: { y0: 17, y1: 22 },
  D: { y0: 28, y1: 33 },
};
export const ROW_IDS: RowId[] = ['A', 'B', 'C', 'D'];

/** Centre line (y) of the two driving lanes. */
export const LANE_Y = { 1: 9, 2: 25 } as const;
/** Cross lane joining lane 1 and lane 2 (x). */
export const CROSS_X = 47.3;

/** Ramp between floors. Cars enter it at yLow (even floors) or yHigh (odd floors). */
export const RAMP = { x0: 51, x1: 58, xc: 54.5, yLow: 9, yHigh: 23 };

/** Entry and exit gate on the ground floor. */
export const GATE = { x: 0, y: 9 };

export function slotCenter(row: RowId, n: number): { x: number; y: number } {
  const r = ROWS[row];
  return { x: SLOT_X0 + (n - 0.5) * SLOT_W, y: (r.y0 + r.y1) / 2 };
}

export function slotId(floor: number, row: RowId, n: number): string {
  return `${FLOORS[floor].code}-${row}${String(n).padStart(2, '0')}`;
}

/** Rows A and B open onto lane 1, rows C and D onto lane 2. */
export function rowLane(row: RowId): 1 | 2 {
  return row === 'A' || row === 'B' ? 1 : 2;
}

/** Where the ramp meets a floor. */
export function rampY(floor: number): number {
  return floor % 2 === 0 ? RAMP.yLow : RAMP.yHigh;
}
