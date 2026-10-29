import { Component, Input, OnInit } from '@angular/core';
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
  ActionSheetController,
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
import { filter, map, startWith, firstValueFrom } from 'rxjs/operators';

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
    IonSelectOption
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="primary">
        <!-- Left Controls: Menu Toggle + In-Screen Back Button on Sub-Pages -->
        <ion-buttons slot="start">
          <ion-menu-button autoHide="false"></ion-menu-button>
          <ion-button
            *ngIf="shouldShowBack$ | async"
            (click)="onBackClick()"
            aria-label="Back">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>

        <!-- Center Dynamic Title (from @Input or resolved from JSON by route) -->
        <ion-title class="header-dynamic-title">
          {{ pageTitle || (resolvedRouteTitle$ | async) }}
        </ion-title>

        <!-- Right Controls: Custom Page Actions (e.g., Reader Bookmark ⭐) + Font Size + Language -->
        <ion-buttons slot="end">
          <ng-content select="[headerEndActions]"></ng-content>

          <!-- Font Size ActionSheet Trigger -->
          <ion-button
            (click)="openFontSizeActionSheet()"
            [attr.aria-label]="(uiText$ | async)?.['font_size_title'] || 'Font Size'">
            <ion-icon slot="icon-only" name="text-outline"></ion-icon>
          </ion-button>

          <!-- Instant Language Switcher -->
          <div class="lang-select-wrapper" *ngIf="(enabledLanguages$ | async) as languages">
            <ion-icon name="language-outline" class="lang-icon"></ion-icon>
            <ion-select
              *ngIf="languages.length > 0"
              interface="popover"
              [value]="selectedLanguage$ | async"
              (ionChange)="onLanguageChange($event.detail.value)"
              class="header-lang-select">
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
  `]
})
export class HeaderComponent implements OnInit {
  /**
   * Optional explicit title override (e.g., Chapter Title passed directly by ReaderComponent).
   * If omitted, HeaderComponent resolves the title automatically from the active route & JSON.
   */
  @Input() pageTitle?: string;

  /**
   * Optional explicit back-button toggle. Defaults to showing the in-screen back button
   * on any route other than `/dashboard`.
   */
  @Input() showBackButton?: boolean;

  public enabledLanguages$: Observable<SupportedLanguage[]> = this.dataService.enabledLanguages$;
  public selectedLanguage$: Observable<string> = this.storageService.selectedLanguage$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public currentUrl$!: Observable<string>;
  public shouldShowBack$!: Observable<boolean>;
  public resolvedRouteTitle$!: Observable<string>;

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private actionSheetCtrl: ActionSheetController,
    private dataService: DataService,
    private storageService: StorageService
  ) {
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

  public onBackClick(): void {
    this.navCtrl.back();
  }

  public async onLanguageChange(newLangCode: string): Promise<void> {
    if (!newLangCode) return;
    await this.storageService.setLanguage(newLangCode);
  }

  public async openFontSizeActionSheet(): Promise<void> {
    const uiText = await firstValueFrom(this.dataService.uiText$);
    const currentScale: FontSizeScale = this.storageService.getCurrentFontSizeSnapshot();

    const buildOption = (scale: FontSizeScale, fallbackLabel: string, uiKey: string) => ({
      text: uiText[uiKey] || fallbackLabel,
      icon: currentScale === scale ? 'checkmark-outline' : undefined,
      cssClass: currentScale === scale ? 'active-font-scale-option' : '',
      handler: () => {
        this.storageService.setFontSize(scale);
      }
    });

    const actionSheet = await this.actionSheetCtrl.create({
      header: uiText['font_size_title'] || 'Select Font Size',
      buttons: [
        buildOption('small', 'Small', 'font_small'),
        buildOption('medium', 'Medium', 'font_medium'),
        buildOption('large', 'Large', 'font_large'),
        {
          text: uiText['cancel'] || 'Cancel',
          icon: 'close-outline',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  public trackByLangCode(_index: number, item: SupportedLanguage): string {
    return item.code;
  }
}
