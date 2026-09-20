import { Component, OnDestroy, OnInit } from '@angular/core';
import { FloorLayout, Vehicle, VehicleStatus } from '../models/parking.model';
import { ParkingDataService } from '../services/parking-data.service';

const TICK_INTERVAL_MS = 5000;

@Component({
  selector: 'app-parking-dashboard',
  templateUrl: './parking-dashboard.component.html',
  styleUrls: ['./parking-dashboard.component.css'],
  standalone:false,
})
export class ParkingDashboardComponent implements OnInit, OnDestroy {
  floors: FloorLayout[] = [];
  vehicles: Vehicle[] = [];

  /** 'all' or a vehicle id — drives both the dropdown and the 3D view */
  selectedVehicleId = 'all';

  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly parkingData: ParkingDataService) {}

  ngOnInit(): void {
    this.floors = this.parkingData.getFloors();
    this.vehicles = this.parkingData.getInitialVehicles();
    this.startTimer();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  // ---------- derived view state ----------

  get selectedVehicle(): Vehicle | null {
    if (this.selectedVehicleId === 'all') {
      return null;
    }
    return this.vehicles.find((v) => v.id === this.selectedVehicleId) ?? null;
  }

  get fleetSummary(): Record<VehicleStatus, number> {
    return this.vehicles.reduce(
      (acc, v) => {
        acc[v.status] += 1;
        return acc;
      },
      { Parked: 0, 'In Transit': 0, Arrived: 0 } as Record<VehicleStatus, number>
    );
  }

  /** Vehicles to render on a given floor deck, respecting the dropdown filter */
  vehiclesOnFloor(floorId: string): Vehicle[] {
    return this.vehicles.filter((v) => {
      if (v.currentFloorId !== floorId) {
        return false;
      }
      return this.selectedVehicleId === 'all' || v.id === this.selectedVehicleId;
    });
  }

  routeProgressPercent(vehicle: Vehicle): number {
    if (vehicle.route.length <= 1) {
      return 100;
    }
    return Math.round((vehicle.routeIndex / (vehicle.route.length - 1)) * 100);
  }

  statusClass(status: VehicleStatus): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  // ---------- actions ----------

  onVehicleSelected(vehicleId: string): void {
    this.selectedVehicleId = vehicleId;
  }

  /** Receptionist assigns a valet to bring the car up from wherever it's parked */
  requestVehicle(vehicle: Vehicle): void {
    if (vehicle.status !== 'Parked') {
      return;
    }
    vehicle.status = 'In Transit';
    vehicle.assignedValet = this.parkingData.nextValet();
  }

  /** Instantly reverts every vehicle to its original parked bay and status */
  reset(): void {
    this.vehicles = this.parkingData.getInitialVehicles();
    this.selectedVehicleId = 'all';
  }

  // ---------- simulation timer ----------

  private startTimer(): void {
    this.timerHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /** Advances every "In Transit" vehicle one waypoint closer to reception */
  private tick(): void {
    for (const vehicle of this.vehicles) {
      if (vehicle.status !== 'In Transit') {
        continue;
      }
      const nextIndex = vehicle.routeIndex + 1;
      const nextWaypoint = vehicle.route[nextIndex];
      if (!nextWaypoint) {
        continue;
      }
      vehicle.routeIndex = nextIndex;
      vehicle.currentFloorId = nextWaypoint.floorId;
      vehicle.currentPosition = { ...nextWaypoint.position };

      if (nextIndex === vehicle.route.length - 1) {
        vehicle.status = 'Arrived';
      }
    }
  }
}
