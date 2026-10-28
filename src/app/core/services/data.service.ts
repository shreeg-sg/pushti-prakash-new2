import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../../environments/environment';
import { AppConfig, Book } from '../models/app-config.model';
import { ThemeService } from './theme.service';

@Injectable({ providedIn: 'root' })
export class DataService {
 private readonly configSubject =
 new BehaviorSubject<AppConfig | null>(null);

 private readonly loadingSubject = new BehaviorSubject<boolean>(false);
 private readonly updateAvailableSubject =
 new BehaviorSubject<boolean>(false);

 readonly config$ = this.configSubject.asObservable();
 readonly loading$ = this.loadingSubject.asObservable();
 readonly updateAvailable$ =
 this.updateAvailableSubject.asObservable();

 readonly books$ = new BehaviorSubject<Book[]>([]).asObservable();

 private initialized = false;

 constructor(private themeService: ThemeService) {
 this.registerResumeListener();
 }

 async initialize(): Promise<void> {
 if (this.initialized) {
 return;
 }

 this.initialized = true;

 await this.loadCache();
 await this.refresh();
 }

 private async registerResumeListener(): Promise<void> {
 await App.addListener('resume', async () => {
 await this.refresh();
 });
 }

 async refresh(): Promise<void> {
 const status = await Network.getStatus();

 if (!status.connected) {
 return;
 }

 await this.fetchRemoteConfig();
 }

 private async loadCache(): Promise<void> {
 const cached = await Preferences.get({
 key: 'remoteAppConfig'
 });

 if (!cached.value) {
 return;
 }

 try {
 const config = JSON.parse(cached.value) as AppConfig;
 this.publishConfig(config);
 } catch {
 await Preferences.remove({ key: 'remoteAppConfig' });
 }
 }

 private async fetchRemoteConfig(): Promise<void> {
 this.loadingSubject.next(true);

 try {
 const separator = environment.dataUrl.includes('?') ? '&' : '?';
 const url = `${environment.dataUrl}${separator}t=${Date.now()}`;

 const response = await fetch(url, {
 cache: 'no-store'
 });

 if (!response.ok) {
 throw new Error(`Configuration request failed: ${response.status}`);
 }

 const config = (await response.json()) as AppConfig;

 await Preferences.set({
 key: 'remoteAppConfig',
 value: JSON.stringify(config)
 });

 this.publishConfig(config);
 this.updateAvailableSubject.next(true);
 } catch (error) {
 console.warn('Remote configuration unavailable', error);
 } finally {
 this.loadingSubject.next(false);
 }
 }

 private publishConfig(config: AppConfig): void {
 this.configSubject.next(config);
 this.themeService.applyTheme(config.app_identity.theme);
 }

 get currentConfig(): AppConfig | null {
 return this.configSubject.value;
 }

 getTranslation(
 key: string,
 language: string,
 fallbackLanguages = ['en', 'hi']
 ): string {
 const translations = this.configSubject.value?.ui_translations[key];

 if (!translations) {
 return key;
 }

 return (
 translations[language] ??
 translations[fallbackLanguages[0]] ??
 translations[fallbackLanguages[1]] ??
 key
 );
 }
}
