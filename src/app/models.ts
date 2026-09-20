/** Shared types used by the feed, the table and the 3D scene. */

export type VehicleStatus =
  | 'Entering'
  | 'Driving'
  | 'Parked'
  | 'Leaving'
  | 'Arrived';
export type VehicleType = 'Sedan' | 'SUV' | 'Hatchback' | 'Van';

/** One static position of a vehicle on a floor. x / y are metres on the floor plan. */
export interface Waypoint {
  floor: number;
  x: number;
  y: number;
  status: VehicleStatus;
  slot: string | null;
}

/** A vehicle and the fixed route it follows in this demo. */
export interface VehicleProfile {
  id: string;
  plate: string;
  guest: string;
  room: string;
  type: VehicleType;
  color: string;
  colorName: string;
  route: Waypoint[];
  /** Which step of the route the vehicle is on at the first refresh. */
  startStep: number;
}

/** What the UI receives on every refresh. A live feed only has to produce this shape. */
export interface VehicleState {
  id: string;
  plate: string;
  guest: string;
  room: string;
  type: VehicleType;
  color: string;
  colorName: string;
  floor: number;
  x: number;
  y: number;
  status: VehicleStatus;
  slot: string | null;
  updatedAt: Date;
}
