import { Injectable } from '@angular/core';
import { Observable, map, timer } from 'rxjs';
import { VehicleState } from './models';
import { RESERVED_SLOTS, VEHICLES } from './vehicle-routes';

/**
 * The single place the UI gets vehicle positions from.
 *
 * DEMO:
 * Vehicles start on Floor 2 and move only once:
 *
 * Floor 2 → Ramp → Floor 1 → Ground → Reception
 *
 * When a vehicle reaches the final waypoint:
 *
 * status = 'Arrived'
 *
 * The vehicle then stays at Reception.
 *
 * Clicking Reset starts the same demo again.
 */
export abstract class VehicleFeed {

  /** Slots reserved by tracked demo vehicles. */
  abstract readonly reservedSlots: string[];

  /** Emits vehicle positions on every interval. */
  abstract stream(intervalMs: number): Observable<VehicleState[]>;

  /** Restart the demo from the beginning. */
  abstract reset(): void;
}


@Injectable()
export class MockVehicleFeed extends VehicleFeed {

  readonly reservedSlots = RESERVED_SLOTS;

  /**
   * Current demo step.
   *
   * IMPORTANT:
   * This does NOT loop.
   */
  private step = 0;

  /**
   * Once true, vehicles remain at their final
   * Reception position.
   */
  private completed = false;


  stream(intervalMs: number): Observable<VehicleState[]> {

    return timer(0, intervalMs).pipe(

      map(() => {

        /**
         * Once the demo is complete,
         * keep returning the final position.
         */
        if (this.completed) {
          return this.snapshot(this.getFinalStep());
        }

        const currentStep = this.step;

        /**
         * Move to the next step for the
         * next refresh.
         */
        this.step++;

        /**
         * Check whether all vehicles have
         * reached the end of their routes.
         */
        if (this.step >= this.getMaxRouteLength()) {
          this.completed = true;
        }

        return this.snapshot(currentStep);
      }),
    );
  }


  /**
   * ----------------------------------------------------------
   * RESET DEMO
   * ----------------------------------------------------------
   *
   * Called when the Reset button is clicked.
   *
   * Next emission starts again from the
   * original Floor 2 positions.
   */
  reset(): void {

    this.step = 0;
    this.completed = false;
  }


  /**
   * ----------------------------------------------------------
   * CREATE VEHICLE SNAPSHOT
   * ----------------------------------------------------------
   */
  private snapshot(step: number): VehicleState[] {

    const updatedAt = new Date();

    return VEHICLES.map((p) => {

      /**
       * IMPORTANT:
       *
       * NO "%" HERE.
       *
       * We clamp the step to the last waypoint.
       */
      const routeStep = Math.min(
        p.startStep + step,
        p.route.length - 1,
      );

      const wp = p.route[routeStep];

      /**
       * If this is the final waypoint,
       * force status to Arrived.
       */
      const isFinal =
        routeStep === p.route.length - 1;

      return {

        id: p.id,
        plate: p.plate,
        guest: p.guest,
        room: p.room,
        type: p.type,

        color: p.color,
        colorName: p.colorName,

        floor: wp.floor,
        x: wp.x,
        y: wp.y,

        /**
         * Final waypoint = Arrived
         */
        status: isFinal
          ? 'Arrived'
          : wp.status,

        /**
         * Parking slot is no longer occupied
         * after the vehicle starts leaving.
         */
        slot: isFinal ? null : wp.slot,

        updatedAt,
      };
    });
  }


  /**
   * Get the longest route.
   *
   * We use the longest route so the demo doesn't
   * finish until every vehicle has reached Reception.
   */
  private getMaxRouteLength(): number {

    return Math.max(
      ...VEHICLES.map(
        (v) => v.startStep + v.route.length,
      ),
    );
  }


  /**
   * Final step used after the demo has completed.
   */
  private getFinalStep(): number {

    return this.getMaxRouteLength();
  }
}