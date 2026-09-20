# Grand Hotel Parking – vehicle movement demo

One page, Angular 20 + Three.js.

- **Top:** vehicle details (plate, guest, room, floor, slot, status, X/Y position).
- **Below:** 3D view of the three parking floors. Every 5 seconds each vehicle moves to its next static coordinate and glides there.
- Click a table row or a car in 3D to highlight it. Floor buttons show one floor at a time.

## Run

```bash
npm install
npm start          # http://localhost:4200
npm run build      # production build in dist/
```

Needs Node.js 20.19+ (or 22.12+).

## Where things are

| File | What it does |
| --- | --- |
| `src/app/parking-layout.ts` | **Floor coordinates**: floor size, slot rows, lanes, ramp, gate (metres) |
| `src/app/vehicle-routes.ts` | **Vehicle coordinates**: the static route of each demo vehicle |
| `src/app/vehicle-feed.ts` | Data source. `MockVehicleFeed` steps the routes every 5 s |
| `src/app/parking-scene/` | The 3D scene (floors, ramps, cars, camera, click to select) |
| `src/app/vehicle-table/` | Vehicle details table |

### Coordinate system

Every floor uses the same plan, in metres. `(0, 0)` is the back-left corner, `x` runs left to right (0–60) and `y` runs back to front (0–34).
Lane 1 is at `y = 9`, lane 2 at `y = 25`, the ramp at `x = 54.5`, the gate at `(0, 9)`.

To move a vehicle somewhere specific, write a waypoint by hand:

```ts
{ floor: 1, x: 20, y: 25, status: 'Driving', slot: null }
```

One waypoint = one 5-second refresh.

## Going live with the mobile app

1. Create `MobileVehicleFeed extends VehicleFeed` and return an `Observable<VehicleState[]>`
   built from your backend (WebSocket / SignalR / HTTP polling). Each item needs
   `floor`, `x`, `y`, `status` and `slot`.
2. In `src/app/app.config.ts` change  
   `{ provide: VehicleFeed, useClass: MockVehicleFeed }` → `{ provide: VehicleFeed, useClass: MobileVehicleFeed }`.

The table and the 3D scene need no changes. The phone sends its position (BLE / UWB / Wi-Fi, or a floor
QR scan plus step tracking); the backend converts it to the floor `x`, `y` in metres used here.
GPS is not reliable inside a parking structure.
