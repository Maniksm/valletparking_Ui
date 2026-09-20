/**
 * Shared type definitions for the Valet Parking & Vehicle Tracking demo.
 *
 * Keeping these in one file means the ParkingDataService and the
 * dashboard component always agree on shape, and a future swap to a
 * real telemetry feed (websocket / REST) only has to satisfy these
 * same interfaces.
 */

export interface Coordinates {
  /** 0–100, percentage position across the deck/lane (left → right) */
  x: number;
  /** 0–100, percentage position down the deck/lane (front → back) */
  y: number;
}

export type FloorType = 'parking' | 'ramp' | 'lobby';

export interface ParkingSpot {
  id: string;
  position: Coordinates;
}

export interface FloorLayout {
  id: string;
  /** Display name, e.g. "Level 3 — Parking" */
  name: string;
  type: FloorType;
  /** Rendering order, top of the tower (highest floor) = 0 */
  order: number;
  /** Fixed bay markers, only meaningful for type === 'parking' */
  spots: ParkingSpot[];
}

/** One stop along a vehicle's route from its parking bay to reception */
export interface RouteWaypoint {
  floorId: string;
  label: string;
  position: Coordinates;
}

export type VehicleStatus = 'Parked' | 'In Transit' | 'Arrived';

export interface Vehicle {
  id: string;
  plateNumber: string;
  guestName: string;
  roomNumber: string;
  model: string;
  color: string;
  checkInTime: string;
  status: VehicleStatus;
  assignedValet: string | null;
  currentFloorId: string;
  currentPosition: Coordinates;
  /** Full ordered route this vehicle will travel when retrieved */
  route: RouteWaypoint[];
  /** Index into `route` for the vehicle's current position */
  routeIndex: number;
}
