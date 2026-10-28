import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { AsyncPipe, NgFor } from '@angular/common';
import { DataService } from '../core/services/data.service';
import { map } from 'rxjs';

@Component({
 selector: 'app-sidebar',
 standalone: true,
 imports: [IonicModule, RouterLink, AsyncPipe, NgFor],
 template: `
 <ion-menu contentId="main-content">
 <ion-header>
 <ion-toolbar>
 <ion-title>{{ appName$ | async }}</ion-title>
 </ion-toolbar>
 </ion-header>

 <ion-content>
 <ion-list>
 <ion-item routerLink="/dashboard">
 Dashboard
 </ion-item>

 <ion-item routerLink="/bookmarks">
 Bookmarks
 </ion-item>

 <ion-item routerLink="/about">
 About Us
 </ion-item>

 <ion-accordion-group>
 <ion-accordion
 *ngFor="let book of books$ | async"
 [value]="book.id"
 >
 <ion-item slot="header">
 <ion-label>{{ book.title['en'] }}</ion-label>
 </ion-item>

 <ion-list slot="content">
 <ion-item
 *ngFor="let chapter of book.chapters"
 [routerLink]="[
 '/reader',
 book.id,
 chapter.id
 ]"
 >
 {{ chapter.title['en'] }}
 </ion-item>
 </ion-list>
 </ion-accordion>
 </ion-accordion-group>
 </ion-list>
 </ion-content>
 </ion-menu>
 `
})
export class SidebarComponent {
 readonly books$ = this.dataService.books$;

 readonly appName$ = this.dataService.config$.pipe(
    map(config => config?.app_identity.appName ?? 'PushtiPrakash')
   );
   

 constructor(private dataService: DataService) {}
}
