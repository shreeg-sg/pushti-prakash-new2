import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';
import { SidebarComponent } from './sidebar.component';
import { FooterComponent } from './footer.component';

@Component({
 selector: 'app-shell',
 standalone: true,
 imports: [
 IonicModule,
 RouterOutlet,
 HeaderComponent,
 SidebarComponent,
 FooterComponent
 ],
 template: `
 <ion-split-pane contentId="main-content">
 <app-sidebar />
 <ion-router-outlet id="main-content" />
 </ion-split-pane>

 <app-footer />
 `
})
export class ShellComponent {}
