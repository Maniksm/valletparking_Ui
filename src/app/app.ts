import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { VehicleState } from './models';
import { FLOORS } from './parking-layout';
import { VehicleFeed } from './vehicle-feed';
import { VehicleTable } from './vehicle-table/vehicle-table';
import { ParkingScene } from './parking-scene/parking-scene';
import { ParkingModule } from './parking.module';

@Component({
  selector: 'app-root',
  imports: [VehicleTable, ParkingScene,ParkingModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly feed = inject(VehicleFeed);
  private sub?: Subscription;

  /** How often the positions refresh. */
  readonly refreshMs = 5000;
  readonly floors = FLOORS;
  readonly reservedSlots = this.feed.reservedSlots;

  readonly vehicles = signal<VehicleState[]>([]);
  readonly movedIds = signal<Set<string>>(new Set());
  readonly selectedId = signal<string | null>(null);
  readonly floorFilter = signal<number | 'all'>('all');
  readonly paused = signal(false);
  readonly tick = signal(0);
  readonly lastUpdate = signal<Date | null>(null);
  readonly resetTick = signal(0);

  readonly summary = computed(() => {
    const list = this.vehicles();
    const parked = list.filter((v) => v.status === 'Parked').length;
    return { total: list.length, parked, moving: list.length - parked };
  });

  readonly floorCounts = computed(() => {
    const list = this.vehicles();
    return FLOORS.map((f) => list.filter((v) => v.floor === f.index).length);
  });

  constructor() {
    this.start();
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  togglePause(): void {
    if (this.paused()) {
      this.paused.set(false);
      this.start();
    } else {
      this.paused.set(true);
      this.sub?.unsubscribe();
    }
  }

  selectVehicle(id: string): void {
    const next = this.selectedId() === id ? null : id;
    this.selectedId.set(next);
    const v = this.vehicles().find((x) => x.id === id);
    const f = this.floorFilter();
    if (next && v && f !== 'all' && f !== v.floor) this.floorFilter.set(v.floor);
  }

  setFloor(f: number | 'all'): void {
    this.floorFilter.set(f);
  }

  

  resetView(): void {
   // this.resetTick.update((n) => n + 1);
      this.feed.reset();

  this.resetTick.update((n) => n + 1);
  }

  private start(): void {
    this.sub = this.feed.stream(this.refreshMs).subscribe((next) => {
      const prev = new Map(this.vehicles().map((v) => [v.id, v]));
      const moved = new Set<string>();
      for (const v of next) {
        const p = prev.get(v.id);
        if (p && (p.x !== v.x || p.y !== v.y || p.floor !== v.floor)) moved.add(v.id);
      }
      this.movedIds.set(moved);
      this.vehicles.set(next);
      this.lastUpdate.set(new Date());
      this.tick.update((n) => n + 1);
    });
  }
}
