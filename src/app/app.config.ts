import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { MockVehicleFeed, VehicleFeed } from './vehicle-feed';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Demo data. Swap for a live feed (mobile app movement) later.
    { provide: VehicleFeed, useClass: MockVehicleFeed },
  ],
};
