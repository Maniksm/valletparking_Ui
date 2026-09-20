import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ParkingDashboardComponent } from './parking-dashboard/parking-dashboard.component';

@NgModule({
  declarations: [ParkingDashboardComponent],
  imports: [CommonModule, FormsModule],
  exports: [ParkingDashboardComponent],
})
export class ParkingModule {}
