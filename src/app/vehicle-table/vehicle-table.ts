import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { VehicleState } from '../models';
import { FLOORS } from '../parking-layout';

@Component({
  selector: 'app-vehicle-table',
  imports: [DecimalPipe],
  templateUrl: './vehicle-table.html',
  styleUrl: './vehicle-table.css',
})
export class VehicleTable {
  readonly vehicles = input.required<VehicleState[]>();
  readonly selectedId = input<string | null>(null);
  readonly movedIds = input<Set<string>>(new Set());
  /** Counts up on every refresh; used to replay the "position changed" highlight. */
  readonly tick = input(0);
  readonly picked = output<string>();

  floorName(index: number): string {
    return FLOORS[index]?.name ?? `Floor ${index}`;
  }
}
