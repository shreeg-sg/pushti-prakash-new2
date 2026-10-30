import { Component, Input, OnInit, inject } from '@angular/core';
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
  NavController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  textOutline,
  languageOutline,
  arrowBackOutline,
  closeOutline,
  optionsOutline,
  checkmarkOutline
} from 'ionicons/icons';
import { Observable, combineLatest } from 'rxjs';
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
        <!-- Start Buttons: Menu or Back Navigation -->
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false"></ion-menu-button>
          <ion-button
            *ngIf="shouldShowBack$ | async"
            (click)="onBackClick()"
            aria-label="Back">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>

        <!-- Center Dynamic Title: Wrapped up to max 2 lines with ellipsis, responsive font -->
        <ion-title class="header-dynamic-title">
          {{ pageTitle || (resolvedRouteTitle$ | async) }}
        </ion-title>

        <!-- End Buttons: Custom actions (Bookmark ⭐) + Single Merged Settings Trigger -->
        <ion-buttons slot="end">
          <ng-content select="[headerEndActions]"></ng-content>

          <!-- Single Merged Settings Trigger Button -->
          <ion-button
            class="settings-trigger-btn"
            (click)="openSettingsPopover($event)"
            aria-label="Reading Settings">
            <ion-icon slot="icon-only" name="options-outline"></ion-icon>
          </ion-button>

          <!-- Unified Settings Popover (Sized comfortably with no word-breaks) -->
          <ion-popover
            [isOpen]="isSettingsPopoverOpen"
            [event]="settingsPopoverEvent"
            (didDismiss)="isSettingsPopoverOpen = false"
            class="header-settings-popover">
            <ng-template>
              <!-- 1st Row: Header Bar with Title and Close Button -->
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
                <!-- Section 1: Language Switcher (No word-breaks for 'English') -->
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

                <!-- Section 2: Font Size Scaling (No word-breaks for 'Medium') -->
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
    /* Max 2 line header with natural word wrap and clean ellipsis */
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
      max-height: 2.6em;
    }
    .settings-trigger-btn {
      --padding-start: 6px;
      --padding-end: 6px;
      font-size: 1.25rem;
    }
    .header-settings-popover {
      --width: 300px;
      --max-width: 92vw;
    }
    .popover-first-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      background: var(--ion-color-light, #f4f5f8);
    }
    .popover-heading {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--ion-text-color, #2c1810);
    }
    .popover-close-btn {
      background: transparent;
      border: none;
      padding: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      color: var(--ion-color-medium, #666666);
      border-radius: 50%;
      transition: background 0.15s ease;

      &:hover, &:active {
        background: rgba(0, 0, 0, 0.08);
      }
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
    .section-label-text {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--ion-color-medium, #666666);
    }
    /* Grid layout with minmax width ensures buttons fit comfortably */
    .pill-group {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
      gap: 8px;
    }
    /* Responsive pill buttons with white-space: nowrap so 'English' and 'Medium' never break */
    .pill-btn {
      width: 100%;
      padding: 9px 4px;
      border-radius: 10px;
      border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.22);
      background: var(--ion-background-color, #ffffff);
      color: var(--ion-text-color, #2c1810);
      font-size: clamp(0.78rem, 2.5vw, 0.86rem);
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      white-space: nowrap !important;
      word-break: keep-all !important;
      hyphens: none !important;
      text-overflow: ellipsis;
      overflow: hidden;
      transition: all 0.18s ease;

      &:hover {
        background: rgba(var(--ion-color-primary-rgb), 0.06);
      }
    }
    .pill-btn.active-pill {
      border-color: var(--ion-color-primary);
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast, #ffffff);
      font-weight: 700;
      box-shadow: 0 2px 6px rgba(var(--ion-color-primary-rgb), 0.3);
    }
  `]
})
export class HeaderComponent implements OnInit {
  private router = inject(Router);
  private navCtrl = inject(NavController);
  public dataService = inject(DataService);
  public storageService = inject(StorageService);

  @Input() pageTitle?: string;
  @Input() showBackButton?: boolean;

  public isSettingsPopoverOpen = false;
  public settingsPopoverEvent: any = null;

  public enabledLanguages$: Observable<SupportedLanguage[]> = this.dataService.enabledLanguages$;
  public selectedLanguage$: Observable<string> = this.storageService.selectedLanguage$;
  public selectedFontSize$: Observable<FontSizeScale> = this.storageService.selectedFontSize$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public currentUrl$!: Observable<string>;
  public shouldShowBack$!: Observable<boolean>;
  public resolvedRouteTitle$!: Observable<string>;

  constructor() {
    addIcons({
      textOutline,
      languageOutline,
      arrowBackOutline,
      closeOutline,
      optionsOutline,
      checkmarkOutline
    });
  }

  ngOnInit(): void {
    this.currentUrl$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    );

    this.shouldShowBack$ = this.currentUrl$.pipe(
      map(url => {
        if (typeof this.showBackButton === 'boolean') {
          return this.showBackButton;
        }
        return url !== '/dashboard' && url !== '/';
      })
    );

    this.resolvedRouteTitle$ = combineLatest([
      this.currentUrl$,
      this.dataService.identity$,
      this.dataService.uiText$,
      this.dataService.visibleBooks$,
      this.storageService.selectedLanguage$
    ]).pipe(
      map(([url, identity, uiText, books, lang]) => {
        if (url.startsWith('/bookmarks')) {
          return uiText['nav_bookmarks'] || 'Bookmarks';
        }
        if (url.startsWith('/about')) {
          return uiText['nav_about'] || 'About Us';
        }
        if (url.startsWith('/chapters/')) {
          const segments = url.split('/');
          const bookId = segments[2];
          const book = books.find(b => b.id === bookId);
          if (book) {
            return this.dataService.localizeField(book.title, lang);
          }
        }
        if (url.startsWith('/reader/')) {
          const segments = url.split('/');
          const bookId = segments[2];
          const chapterId = segments[3];
          const book = books.find(b => b.id === bookId);
          const chapter = book?.chapters.find(c => c.id === chapterId);
          if (chapter) {
            return this.dataService.localizeField(chapter.title, lang);
          }
          if (book) {
            return this.dataService.localizeField(book.title, lang);
          }
        }
        return (
          this.dataService.localizeField(identity?.appName, lang) ||
          identity?.defaultAppName ||
          ''
        );
      })
    );
  }

  public openSettingsPopover(event: Event): void {
    this.settingsPopoverEvent = event;
    this.isSettingsPopoverOpen = true;
  }

  public onBackClick(): void {
    this.navCtrl.back();
  }

  public async onLanguageChange(newLangCode: string): Promise<void> {
    if (!newLangCode) return;
    await this.storageService.setLanguage(newLangCode);
  }

  public async setFontScale(scale: FontSizeScale): Promise<void> {
    await this.storageService.setFontSize(scale);
  }

  public trackByLangCode(_index: number, item: SupportedLanguage): string {
    return item.code;
  }
}