import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonIcon,
  IonTitle,
  IonPopover,
  NavController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  textOutline,
  languageOutline,
  arrowBackOutline,
  closeOutline,
  optionsOutline,
  checkmarkOutline,
  searchOutline
} from 'ionicons/icons';
import { Observable, combineLatest, firstValueFrom } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

import { DataService } from '../core/services/data.service';
import { StorageService } from '../core/services/storage.service';
import { FontSizeScale, SupportedLanguage } from '../core/models/app-config.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonButton,
    IonIcon,
    IonTitle,
    IonPopover
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="primary" class="main-header-toolbar">
        <ion-buttons slot="start">
          <ion-menu-button autoHide="true" *ngIf="!isSearchActive"></ion-menu-button>
          <ion-button
            *ngIf="(shouldShowBack$ | async) && !isSearchActive"
            (click)="onBackClick()"
            aria-label="Back">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>

        <!-- Standard Title View -->
        <ion-title class="header-dynamic-title" *ngIf="!isSearchActive">
          {{ pageTitle || (resolvedRouteTitle$ | async) }}
        </ion-title>

        <!-- Dynamic Header Search Input View (Dashboard Only) -->
        <div class="header-search-box" *ngIf="isSearchActive">
          <ion-icon name="search-outline" class="search-box-icon"></ion-icon>
          <input
            #searchInput
            type="text"
            [placeholder]="searchPlaceholder"
            [value]="searchQuery"
            (input)="onSearchInput($event)"
            class="header-search-input"
            autofocus />
          <button
            type="button"
            *ngIf="searchQuery"
            class="search-clear-btn"
            (click)="clearSearch()"
            aria-label="Clear Search">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>

        <ion-buttons slot="end">
          <!-- Search Toggle Button (Dashboard Only) -->
          <ion-button
            *ngIf="showSearch"
            class="search-toggle-btn"
            (click)="toggleSearch()"
            [attr.aria-label]="isSearchActive ? 'Close search' : 'Search books'">
            <ion-icon slot="icon-only" [name]="isSearchActive ? 'close-outline' : 'search-outline'"></ion-icon>
          </ion-button>

          <ng-content select="[headerEndActions]"></ng-content>

          <!-- Settings Trigger Button -->
          <ion-button
            *ngIf="!isSearchActive"
            class="settings-trigger-btn"
            (click)="openSettingsPopover($event)"
            aria-label="Reading Settings">
            <ion-icon slot="icon-only" name="options-outline"></ion-icon>
          </ion-button>

          <!-- Settings & Preferences Popover -->
          <ion-popover
            [isOpen]="isSettingsPopoverOpen"
            [event]="settingsPopoverEvent"
            (didDismiss)="isSettingsPopoverOpen = false"
            class="header-settings-popover">
            <ng-template>
              <div class="popover-first-row">
                <span class="popover-heading">
                  {{ (uiText$ | async)?.['settings_title'] || 'Preferences' }}
                </span>
                <button
                  type="button"
                  class="popover-close-btn"
                  aria-label="Close"
                  (click)="isSettingsPopoverOpen = false">
                  <ion-icon name="close-outline"></ion-icon>
                </button>
              </div>

              <div class="popover-body-content">
                <div class="popover-section" *ngIf="(enabledLanguages$ | async) as languages">
                  <div class="section-label-row">
                    <ion-icon name="language-outline" color="primary"></ion-icon>
                    <span class="section-label-text">
                      {{ (uiText$ | async)?.['select_language_prompt'] || 'Language' }}
                    </span>
                  </div>
                  <div class="pill-group">
                    <button
                      type="button"
                      *ngFor="let lang of languages; trackBy: trackByLangCode"
                      class="pill-btn"
                      [class.active-pill]="(selectedLanguage$ | async) === lang.code"
                      (click)="onLanguageChange(lang.code)">
                      {{ lang.name }}
                    </button>
                  </div>
                </div>

                <div class="popover-section">
                  <div class="section-label-row">
                    <ion-icon name="text-outline" color="primary"></ion-icon>
                    <span class="section-label-text">
                      {{ (uiText$ | async)?.['font_size_title'] || 'Font Size' }}
                    </span>
                  </div>
                  <div class="pill-group">
                    <button
                      type="button"
                      class="pill-btn"
                      [class.active-pill]="(selectedFontSize$ | async) === 'small'"
                      (click)="setFontScale('small')">
                      {{ (uiText$ | async)?.['font_small'] || 'Small' }}
                    </button>
                    <button
                      type="button"
                      class="pill-btn"
                      [class.active-pill]="(selectedFontSize$ | async) === 'medium'"
                      (click)="setFontScale('medium')">
                      {{ (uiText$ | async)?.['font_medium'] || 'Medium' }}
                    </button>
                    <button
                      type="button"
                      class="pill-btn"
                      [class.active-pill]="(selectedFontSize$ | async) === 'large'"
                      (click)="setFontScale('large')">
                      {{ (uiText$ | async)?.['font_large'] || 'Large' }}
                    </button>
                  </div>
                </div>
              </div>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
  styles: [`
    .main-header-toolbar {
      --min-height: 56px;
      padding: 0 4px;
    }
    ion-title.header-dynamic-title {
      padding: 0 4px;
      position: relative;
    }
    :host ::ng-deep ion-title.header-dynamic-title .toolbar-title,
    ion-title.header-dynamic-title .toolbar-title {
      white-space: normal !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      font-weight: 700;
      font-size: clamp(0.85rem, 3.2vw, 1rem);
      line-height: 1.25;
      text-align: center;
      margin: 0 auto;
      max-width: 90%;
    }

    .header-search-box {
      flex: 1;
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.22);
      border-radius: 20px;
      padding: 4px 12px;
      margin: 0 8px;
      gap: 8px;
    }

    .search-box-icon {
      font-size: 1.15rem;
      color: #fff;
      opacity: 0.9;
      flex-shrink: 0;
    }

    .header-search-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      width: 100%;

      &::placeholder {
        color: rgba(255, 255, 255, 0.75);
      }
    }

    .search-clear-btn {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 1.15rem;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      opacity: 0.85;
    }

    .search-toggle-btn {
      --color: #fff;
    }

    .header-settings-popover {
      --width: 290px;
    }
    .popover-first-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 6px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .popover-heading {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--ion-color-medium, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .popover-close-btn {
      background: transparent;
      border: none;
      color: var(--ion-color-medium, #888);
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      cursor: pointer;
    }
    .popover-body-content {
      padding: 12px 14px 16px;
    }
    .popover-section {
      margin-bottom: 14px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    .section-label-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    .section-label-row ion-icon {
      font-size: 1rem;
    }
    .section-label-text {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ion-color-medium, #666);
    }
    .pill-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .pill-btn {
      flex: 1;
      min-width: 65px;
      padding: 6px 10px;
      border-radius: 16px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.25);
      background: var(--ion-card-background, #fff8ec);
      color: var(--ion-color-primary);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
    }
    .pill-btn.active-pill {
      background: var(--ion-color-primary);
      color: #ffffff;
      border-color: var(--ion-color-primary);
    }
  `]
})
export class HeaderComponent implements OnInit {
  @Input() pageTitle?: string;
  @Input() showBackButton?: boolean;
  @Input() showSearch = false;
  @Input() searchPlaceholder = 'Search books...';
  @Output() searchChange = new EventEmitter<string>();

  private router = inject(Router);
  private navCtrl = inject(NavController);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);
  private toastCtrl = inject(ToastController);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public enabledLanguages$: Observable<SupportedLanguage[]> = this.dataService.enabledLanguages$;
  public selectedLanguage$: Observable<string> = this.storageService.selectedLanguage$;
  public selectedFontSize$: Observable<FontSizeScale> = this.storageService.selectedFontSize$;

  public isSettingsPopoverOpen = false;
  public settingsPopoverEvent: any = null;

  public isSearchActive = false;
  public searchQuery = '';

  public resolvedRouteTitle$: Observable<string> = combineLatest([
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      startWith(null)
    ),
    this.dataService.config$,
    this.storageService.selectedLanguage$
  ]).pipe(
    map(([_, cfg, lang]) => {
      const url = this.router.url;
      if (url.includes('/dashboard')) {
        return this.dataService.localizeField(cfg.app_identity.appName, lang) || cfg.app_identity.defaultAppName;
      }
      if (url.includes('/bookmarks')) {
        return this.dataService.localizeField(cfg.ui_translations['nav_bookmarks'], lang) || 'Bookmarks';
      }
      if (url.includes('/about')) {
        return this.dataService.localizeField(cfg.ui_translations['nav_about'], lang) || 'About Us';
      }
      return '';
    })
  );

  public shouldShowBack$: Observable<boolean> = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    startWith(null),
    map(() => {
      if (this.showBackButton !== undefined) {
        return this.showBackButton;
      }
      const url = this.router.url;
      return !url.includes('/dashboard');
    })
  );

  constructor() {
    addIcons({
      textOutline,
      languageOutline,
      arrowBackOutline,
      closeOutline,
      optionsOutline,
      checkmarkOutline,
      searchOutline
    });
  }

  ngOnInit(): void { }

  public toggleSearch(): void {
    this.isSearchActive = !this.isSearchActive;
    if (!this.isSearchActive) {
      this.clearSearch();
    }
  }

  public onSearchInput(event: any): void {
    this.searchQuery = event.target?.value || '';
    this.searchChange.emit(this.searchQuery);
  }

  public clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
  }

  public onBackClick(): void {
    this.navCtrl.back();
  }

  public openSettingsPopover(event: Event): void {
    this.settingsPopoverEvent = event;
    this.isSettingsPopoverOpen = true;
  }

  public async onLanguageChange(code: string): Promise<void> {
    await this.storageService.setLanguage(code);
    const langs = await firstValueFrom(this.enabledLanguages$);
    const label = langs.find((l: SupportedLanguage) => l.code === code)?.name || code.toUpperCase();
    const toast = await this.toastCtrl.create({
      message: `${label}`,
      duration: 1200,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }
  
  public async setFontScale(scale: FontSizeScale): Promise<void> {
    await this.storageService.setFontSize(scale);
    const uiText = await firstValueFrom(this.uiText$);
    const key = `font_${scale}`;
    const toast = await this.toastCtrl.create({
      message: `${uiText['font_size_title'] || 'Font Size'}: ${uiText[key] || scale}`,
      duration: 1200,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }

  public trackByLangCode(_index: number, lang: SupportedLanguage): string {
    return lang.code;
  }
}