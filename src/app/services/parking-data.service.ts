import { Injectable } from '@angular/core';
import {
  Coordinates,
  FloorLayout,
  RouteWaypoint,
  Vehicle,
} from '../models/parking.model';

/**
 * ParkingDataService
 * -------------------
 * Single source of truth for everything "world state": the physical
 * layout of the structure (floors, ramps, bay coordinates) and the
 * seed data for each vehicle (guest, plate, starting bay, status).
 *
 * Everything here is static/mock today. The public methods
 * (getFloors / getInitialVehicles) are the only surface the dashboard
 * component talks to, so swapping this internals for a live feed
 * (websocket, polling REST endpoint, mobile-app push updates) later
 * will not require any change to component logic — only the
 * implementation of these two methods.
 */
@Injectable({ providedIn: 'root' })
export class ParkingDataService {
  /** Reception drop-off point, shared by every vehicle's final stop */
  private readonly RECEPTION_POSITION: Coordinates = { x: 50, y: 70 };

  /**
   * The structure, top floor first. Order drives both the visual
   * stacking (rendered top → bottom) and the route-building logic
   * (a vehicle walks the floors from its start down to order 0 / lobby).
   */
  private readonly FLOORS: FloorLayout[] = [
    {
      id: 'floor-3',
      name: 'Level 3 — Parking',
      type: 'parking',
      order: 6,
      spots: [
        { id: 'f3-a1', position: { x: 20, y: 30 } },
        { id: 'f3-a2', position: { x: 50, y: 30 } },
        { id: 'f3-a3', position: { x: 80, y: 30 } },
      ],
    },
    {
      id: 'ramp-3-2',
      name: 'Ramp ↓ Level 3 to Level 2',
      type: 'ramp',
      order: 5,
      spots: [],
    },
    {
      id: 'floor-2',
      name: 'Level 2 — Parking',
      type: 'parking',
      order: 4,
      spots: [
        { id: 'f2-a1', position: { x: 20, y: 30 } },
        { id: 'f2-a2', position: { x: 50, y: 30 } },
        { id: 'f2-a3', position: { x: 80, y: 30 } },
      ],
    },
    {
      id: 'ramp-2-1',
      name: 'Ramp ↓ Level 2 to Level 1',
      type: 'ramp',
      order: 3,
      spots: [],
    },
    {
      id: 'floor-1',
      name: 'Level 1 — Parking',
      type: 'parking',
      order: 2,
      spots: [
        { id: 'f1-a1', position: { x: 20, y: 30 } },
        { id: 'f1-a2', position: { x: 50, y: 30 } },
        { id: 'f1-a3', position: { x: 80, y: 30 } },
      ],
    },
    {
      id: 'ramp-1-lobby',
      name: 'Ramp ↓ Level 1 to Lobby',
      type: 'ramp',
      order: 1,
      spots: [],
    },
    {
      id: 'lobby',
      name: 'Lobby — Reception',
      type: 'lobby',
      order: 0,
      spots: [],
    },
  ];

  /**
   * Seed data for the demo fleet. `startFloorId` + `startSpotId` are
   * resolved against FLOORS to build each vehicle's full route down
   * to reception via buildRoute().
   */
  private readonly VEHICLE_SEEDS: Array<{
    id: string;
    plateNumber: string;
    guestName: string;
    roomNumber: string;
    model: string;
    color: string;
    checkInTime: string;
    startFloorId: string;
    startSpotId: string;
  }> = [
    {
      id: 'veh-1',
      plateNumber: 'TN 07 GR 1204',
      guestName: 'Alistair Grant',
      roomNumber: '1204',
      model: 'Rolls-Royce Phantom',
      color: 'Obsidian Black',
      checkInTime: '2:15 PM',
      startFloorId: 'floor-3',
      startSpotId: 'f3-a1',
    },
    {
      id: 'veh-2',
      plateNumber: 'TN 09 IM 0815',
      guestName: 'Isabelle Moreau',
      roomNumber: '815',
      model: 'Bentley Continental GT',
      color: 'British Racing Green',
      checkInTime: '3:40 PM',
      startFloorId: 'floor-2',
      startSpotId: 'f2-a2',
    },
    {
      id: 'veh-3',
      plateNumber: 'TN 10 KW 1502',
      guestName: 'Kenji Watanabe',
      roomNumber: '1502',
      model: 'Range Rover Autobiography',
      color: 'Santorini Black',
      checkInTime: '11:05 AM',
      startFloorId: 'floor-3',
      startSpotId: 'f3-a3',
    },
    {
      id: 'veh-4',
      plateNumber: 'TN 22 PN 0902',
      guestName: 'Priya Nair',
      roomNumber: '902',
      model: 'Mercedes-Maybach S-Class',
      color: 'Diamond White',
      checkInTime: '1:20 PM',
      startFloorId: 'floor-1',
      startSpotId: 'f1-a2',
    },
  ];

  /** Round-robin pool used when a vehicle is requested for retrieval */
  private readonly VALETS = ['Marco Silva', 'Elena Cruz', 'Daniel Kim'];
  private valetCursor = 0;

  getFloors(): FloorLayout[] {
    // Return a defensive copy so a caller can't mutate shared layout data.
    return JSON.parse(JSON.stringify(this.FLOORS));
  }

  /**
   * Builds the fleet fresh from seed data every time it is called.
   * The dashboard calls this both on init and on "Reset" so vehicles
   * always come back to their exact starting bay and status.
   */
  getInitialVehicles(): Vehicle[] {
    return this.VEHICLE_SEEDS.map((seed) => {
      const route = this.buildRoute(seed.startFloorId, seed.startSpotId);
      return {
        id: seed.id,
        plateNumber: seed.plateNumber,
        guestName: seed.guestName,
        roomNumber: seed.roomNumber,
        model: seed.model,
        color: seed.color,
        checkInTime: seed.checkInTime,
        status: 'Parked',
        assignedValet: null,
        currentFloorId: route[0].floorId,
        currentPosition: { ...route[0].position },
        route,
        routeIndex: 0,
      } as Vehicle;
    });
  }

  /** Hands out valets round-robin so concurrent retrievals feel realistic */
  nextValet(): string {
    const valet = this.VALETS[this.valetCursor % this.VALETS.length];
    this.valetCursor += 1;
    return valet;
  }

  /**
   * Walks the floor list from the vehicle's starting floor down to the
   * lobby (order 0), producing one waypoint per floor/ramp along the
   * way. This is what lets "Floor 3 → Ramp → Floor 2 → … → Lobby"
   * fall out automatically instead of being hand-authored per vehicle.
   */
  private buildRoute(startFloorId: string, startSpotId: string): RouteWaypoint[] {
    const startFloor = this.FLOORS.find((f) => f.id === startFloorId)!;
    const startSpot = startFloor.spots.find((s) => s.id === startSpotId)!;

    const floorsDescending = [...this.FLOORS]
      .filter((f) => f.order <= startFloor.order)
      .sort((a, b) => b.order - a.order);

    return floorsDescending.map((floor) => {
      if (floor.id === startFloor.id) {
        return {
          floorId: floor.id,
          label: `Parked — ${floor.name}`,
          position: { ...startSpot.position },
        };
      }
      if (floor.type === 'ramp') {
        return {
          floorId: floor.id,
          label: floor.name,
          position: { x: 50, y: 50 },
        };
      }
      if (floor.type === 'lobby') {
        return {
          floorId: floor.id,
          label: 'Lobby — Reception',
          position: { ...this.RECEPTION_POSITION },
        };
      }
      // Passing through a parking floor on the way down (not its origin)
      return {
        floorId: floor.id,
        label: `Transiting — ${floor.name}`,
        position: { x: 50, y: 70 },
      };
    });
  }
}
