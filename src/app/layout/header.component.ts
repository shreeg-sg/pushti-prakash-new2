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
  IonSelect,
  IonSelectOption,
  IonPopover,
  IonList,
  IonItem,
  IonLabel,
  NavController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  textOutline,
  languageOutline,
  arrowBackOutline,
  checkmarkOutline,
  closeOutline
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
    IonSelect,
    IonSelectOption,
    IonPopover,
    IonList,
    IonItem,
    IonLabel
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false"></ion-menu-button>
          <ion-button
            *ngIf="shouldShowBack$ | async"
            (click)="onBackClick()"
            aria-label="Back">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>

        <ion-title class="header-dynamic-title">
          {{ pageTitle || (resolvedRouteTitle$ | async) }}
        </ion-title>

        <ion-buttons slot="end">
          <ng-content select="[headerEndActions]"></ng-content>

          <!-- Font Size Popover Trigger (Works across ALL pages using event-driven [isOpen]) -->
          <ion-button
            (click)="openFontPopover($event)"
            [attr.aria-label]="(uiText$ | async)?.['font_size_title'] || 'Font Size'">
            <ion-icon slot="icon-only" name="text-outline"></ion-icon>
          </ion-button>

          <!-- Font Size Popover: 1st row has Title & Close/Cancel button -->
          <ion-popover
            [isOpen]="isFontPopoverOpen"
            [event]="fontPopoverEvent"
            (didDismiss)="isFontPopoverOpen = false"
            class="font-size-popover">
            <ng-template>
              <div class="popover-first-row">
                <span class="popover-heading">{{ (uiText$ | async)?.['font_size_title'] || 'Font Size' }}</span>
                <button
                  type="button"
                  class="popover-close-btn"
                  aria-label="Close"
                  (click)="isFontPopoverOpen = false">
                  <ion-icon name="close-outline"></ion-icon>
                </button>
              </div>
              <ion-list lines="full" class="font-options-list">
                <ion-item
                  button
                  detail="false"
                  [class.active-font-item]="(selectedFontSize$ | async) === 'small'"
                  (click)="setFontScale('small')">
                  <ion-label>{{ (uiText$ | async)?.['font_small'] || 'Small' }}</ion-label>
                  <ion-icon slot="end" name="checkmark-outline" *ngIf="(selectedFontSize$ | async) === 'small'"></ion-icon>
                </ion-item>
                <ion-item
                  button
                  detail="false"
                  [class.active-font-item]="(selectedFontSize$ | async) === 'medium'"
                  (click)="setFontScale('medium')">
                  <ion-label>{{ (uiText$ | async)?.['font_medium'] || 'Medium' }}</ion-label>
                  <ion-icon slot="end" name="checkmark-outline" *ngIf="(selectedFontSize$ | async) === 'medium'"></ion-icon>
                </ion-item>
                <ion-item
                  button
                  detail="false"
                  [class.active-font-item]="(selectedFontSize$ | async) === 'large'"
                  (click)="setFontScale('large')">
                  <ion-label>{{ (uiText$ | async)?.['font_large'] || 'Large' }}</ion-label>
                  <ion-icon slot="end" name="checkmark-outline" *ngIf="(selectedFontSize$ | async) === 'large'"></ion-icon>
                </ion-item>
              </ion-list>
            </ng-template>
          </ion-popover>

          <!-- Language Dropdown -->
          <div class="lang-select-wrapper" *ngIf="(enabledLanguages$ | async) as languages">
            <ion-icon name="language-outline" class="lang-icon"></ion-icon>
            <ion-select
              *ngIf="languages.length > 0"
              interface="popover"
              [value]="selectedLanguage$ | async"
              (ionChange)="onLanguageChange($event.detail.value)"
              class="header-lang-select"
              aria-label="Select Language">
              <ion-select-option
                *ngFor="let lang of languages; trackBy: trackByLangCode"
                [value]="lang.code">
                {{ lang.name }}
              </ion-select-option>
            </ion-select>
          </div>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
  styles: [`
    .header-dynamic-title {
      font-weight: 600;
      font-size: 1.05rem;
      text-align: center;
    }
    .lang-select-wrapper {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      padding: 0 8px;
      margin-left: 4px;
      margin-right: 6px;
    }
    .lang-icon {
      font-size: 1rem;
      margin-right: 4px;
      color: var(--ion-toolbar-color, #ffffff);
    }
    .header-lang-select {
      --padding-start: 2px;
      --padding-end: 2px;
      --padding-top: 4px;
      --padding-bottom: 4px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--ion-toolbar-color, #ffffff);
      min-height: 30px;
    }
    .popover-first-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      background: var(--ion-color-light, #f4f5f8);
    }
    .popover-heading {
      font-size: 0.95rem;
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

      &:hover, &:active {
        background: rgba(0, 0, 0, 0.08);
      }
    }
    .font-options-list {
      padding: 4px 0;
    }
    .active-font-item {
      --color: var(--ion-color-primary);
      font-weight: 600;
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

  public isFontPopoverOpen = false;
  public fontPopoverEvent: any = null;

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
      checkmarkOutline,
      closeOutline
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

  public openFontPopover(event: Event): void {
    this.fontPopoverEvent = event;
    this.isFontPopoverOpen = true;
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
    this.isFontPopoverOpen = false;
  }

  public trackByLangCode(_index: number, item: SupportedLanguage): string {
    return item.code;
  }
}