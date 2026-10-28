import { Component, Input } from '@angular/core';
import { IonicModule, ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';
import { StorageService, FontSize } from '../core/services/storage.service';
import { ThemeService } from '../core/services/theme.service';

@Component({
 selector: 'app-header',
 standalone: true,
 imports: [IonicModule],
 template: `
 <ion-header>
 <ion-toolbar>
 <ion-buttons slot="start">
 <ion-menu-button />
 </ion-buttons>

 <ion-title>{{ title }}</ion-title>

 <ion-buttons slot="end">
 <ion-button (click)="chooseFontSize()">
 <ion-icon name="text-outline" />
 </ion-button>

 <ion-select
 interface="popover"
 [value]="language"
 (ionChange)="changeLanguage($event.detail.value)"
 >
 <ion-select-option
 *ngFor="let item of languages"
 [value]="item.code"
 >
 {{ item.name }}
 </ion-select-option>
 </ion-select>
 </ion-buttons>
 </ion-toolbar>
 </ion-header>
 `
})
export class HeaderComponent {
 @Input() title = '';
 @Input() language = 'en';
 @Input() languages: Array<{ code: string; name: string }> = [];

 constructor(
 private actionSheetController: ActionSheetController,
 private storage: StorageService,
 private theme: ThemeService,
 private router: Router
 ) {}

 async chooseFontSize(): Promise<void> {
 const sheet = await this.actionSheetController.create({
 header: 'Font size',
 buttons: [
 {
 text: 'Small',
 handler: () => void this.setFontSize('small')
 },
 {
 text: 'Medium',
 handler: () => void this.setFontSize('medium')
 },
 {
 text: 'Large',
 handler: () => void this.setFontSize('large')
 },
 {
 text: 'Cancel',
 role: 'cancel'
 }
 ]
 });

 await sheet.present();
 }

 async setFontSize(size: FontSize): Promise<void> {
 await this.storage.setFontSize(size);
 this.theme.applyFontSize(size);
 }

 async changeLanguage(language: string): Promise<void> {
 await this.storage.setLanguage(language);
 await this.router.navigateByUrl('/dashboard');
 }
}
