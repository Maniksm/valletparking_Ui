import { VehicleProfile, VehicleStatus, VehicleType, Waypoint } from './models';
import {
  CROSS_X,
  GATE,
  LANE_Y,
  RAMP,
  RowId,
  rampY,
  rowLane,
  slotCenter,
  slotId,
} from './parking-layout';

/**
 * ============================================================
 * DEMO EXIT ROUTES
 * ============================================================
 *
 * TEST SCENARIO:
 *
 * Vehicle starts already parked on FLOOR 2
 *
 *       FLOOR 2
 *       Slot
 *         ↓
 *      Lane
 *         ↓
 *       Ramp
 *         ↓
 *       FLOOR 1
 *         ↓
 *      GROUND
 *         ↓
 *    RECEPTION / GATE
 *
 * All 3 demo vehicles are initially on Floor 2.
 *
 * When the route finishes, the vehicle has reached the
 * Ground Floor Reception/Gate.
 */

interface Pt {
  floor: number;
  x: number;
  y: number;
}

const MAX_STEP = 22;

/**
 * ------------------------------------------------------------
 * Build EXIT route
 * ------------------------------------------------------------
 *
 * Starts:
 *   Floor 2 parking slot
 *
 * Ends:
 *   Ground floor Gate / Reception
 */
function buildExitPath(
  floor: number,
  row: RowId,
  n: number,
): Pt[] {

  const slot = slotCenter(row, n);

  const pts: Pt[] = [];

  /**
   * ----------------------------------------------------------
   * 1. START AT PARKING SLOT
   * ----------------------------------------------------------
   */
  pts.push({
    floor,
    x: slot.x,
    y: slot.y,
  });

  /**
   * ----------------------------------------------------------
   * 2. MOVE FROM SLOT TO ITS DRIVING LANE
   * ----------------------------------------------------------
   */
  const lane = rowLane(row);

  pts.push({
    floor,
    x: slot.x,
    y: LANE_Y[lane],
  });

  /**
   * ----------------------------------------------------------
   * 3. MOVE TOWARDS RAMP
   * ----------------------------------------------------------
   */
  pts.push({
    floor,
    x: RAMP.xc,
    y: LANE_Y[lane],
  });

  /**
   * ----------------------------------------------------------
   * 4. GO DOWN THE RAMP
   *
   * Floor 2 → Floor 1 → Ground
   * ----------------------------------------------------------
   */

  for (let f = floor - 1; f >= 0; f--) {
    pts.push({
      floor: f,
      x: RAMP.xc,
      y: rampY(f),
    });
  }

  /**
   * ----------------------------------------------------------
   * 5. GROUND FLOOR → RECEPTION / GATE
   * ----------------------------------------------------------
   */

  pts.push({
    floor: 0,
    x: GATE.x,
    y: GATE.y,
  });

  /**
   * Remove duplicate points
   */
  return pts.filter(
    (p, i) =>
      i === 0 ||
      p.floor !== pts[i - 1].floor ||
      p.x !== pts[i - 1].x ||
      p.y !== pts[i - 1].y,
  );
}


/**
 * ------------------------------------------------------------
 * Split long straight segments
 * ------------------------------------------------------------
 *
 * This prevents the vehicle from jumping too far
 * during one refresh.
 */
function subdivide(pts: Pt[]): Pt[] {

  const out: Pt[] = [pts[0]];

  for (let i = 1; i < pts.length; i++) {

    const a = pts[i - 1];
    const b = pts[i];

    if (a.floor === b.floor) {

      const parts = Math.ceil(
        Math.hypot(
          b.x - a.x,
          b.y - a.y,
        ) / MAX_STEP,
      );

      for (let k = 1; k < parts; k++) {

        const t = k / parts;

        out.push({
          floor: a.floor,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
      }
    }

    out.push(b);
  }

  return out;
}


/**
 * Round coordinates to one decimal place
 */
const round1 = (n: number) =>
  Math.round(n * 10) / 10;


/**
 * ------------------------------------------------------------
 * Build vehicle EXIT route
 * ------------------------------------------------------------
 */
function buildExitRoute(
  floor: number,
  row: RowId,
  n: number,
): Waypoint[] {

  const steps = subdivide(
    buildExitPath(floor, row, n),
  );

  const last = steps.length - 1;

  const wp = (
    p: Pt,
    status: VehicleStatus,
  ): Waypoint => ({
    floor: p.floor,
    x: round1(p.x),
    y: round1(p.y),
    status,
    slot: null,
  });

  return steps.map((p, i) => {

    /**
     * First point:
     * Vehicle is already parked.
     */
    if (i === 0) {
      return {
        floor: p.floor,
        x: round1(p.x),
        y: round1(p.y),
        status: 'Parked',
        slot: slotId(floor, row, n),
      };
    }

    /**
     * Last point:
     * Vehicle reached Reception / Gate.
     */
    if (i === last) {
      return wp(p, 'Leaving');
    }

    /**
     * Everything between slot and gate
     */
    return wp(p, 'Leaving');
  });
}


/**
 * ------------------------------------------------------------
 * Vehicle definition for EXIT TEST
 * ------------------------------------------------------------
 */
function exitVehicle(
  id: string,
  plate: string,
  guest: string,
  room: string,
  type: VehicleType,
  colorName: string,
  color: string,
  floor: number,
  row: RowId,
  slot: number,
  startStep: number,
): VehicleProfile {

  return {
    id,
    plate,
    guest,
    room,
    type,
    color,
    colorName,

    /**
     * IMPORTANT:
     *
     * This route starts directly at the parking slot.
     */
    route: buildExitRoute(
      floor,
      row,
      slot,
    ),

    startStep,
  };
}


/**
 * ============================================================
 * 3 VEHICLES
 * ============================================================
 *
 * All start from FLOOR 2.
 *
 * v3 → Floor 2 / Row A / Slot 12
 * v8 → Floor 2 / Row C / Slot 3
 * v9 → Floor 2 / Row D / Slot 7
 *
 * Then:
 *
 * Floor 2
 *    ↓
 * Ramp
 *    ↓
 * Floor 1
 *    ↓
 * Ground
 *    ↓
 * Reception
 *
 * startStep is used to stagger their starting time.
 */
export const VEHICLES: VehicleProfile[] = [

exitVehicle(
  'v3',
  'KL 03 MN 2264',
  'Mani',
  'Room 305',
  'Hatchback',
  'Red',
  '#D2392E',
  2,
  'A',
  12,
  0,
),

exitVehicle(
  'v8',
  'TN 05 HG 1187',
  'Durai',
  'Room 733',
  'Hatchback',
  'Pink',
  '#E0559F',
  2,
  'C',
  3,
  0,
),

exitVehicle(
  'v9',
  'KL 10 ZQ 6402',
  'Rajan',
  'Room 514',
  'Sedan',
  'Violet',
  '#8A5DDB',
  2,
  'D',
  7,
  0,
),
];


/**
 * ============================================================
 * RESERVED SLOTS
 * ============================================================
 *
 * These slots are occupied by the demo vehicles initially.
 */
export const RESERVED_SLOTS: string[] =
  VEHICLES
    .flatMap((v) =>
      v.route
        .filter((w) => w.slot)
        .map((w) => w.slot as string),
    )
    .filter(
      (s, i, all) =>
        all.indexOf(s) === i,
    );