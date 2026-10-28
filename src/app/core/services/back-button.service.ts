import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class BackButtonService {
 private lastBackPress = 0;

 constructor(private router: Router) {}

 async initialize(): Promise<void> {
 await App.addListener('backButton', async () => {
 const rootRoutes = ['/dashboard', '/onboarding'];
 const currentUrl = this.router.url;

 if (!rootRoutes.includes(currentUrl)) {
 await this.router.navigateByUrl('/dashboard');
 return;
 }

 const now = Date.now();

 if (now - this.lastBackPress < 2000) {
 await App.exitApp();
 return;
 }

 this.lastBackPress = now;
 });
 }
}
