import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonFooter,
  IonList,
  IonListHeader,
  IonItem,
  IonIcon,
  IonLabel,
  IonAccordionGroup,
  IonAccordion,
  MenuController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  bookmarkOutline,
  calendarOutline,
  informationCircleOutline,
  bookOutline,
  documentTextOutline,
  logOutOutline
} from 'ionicons/icons';
import { Observable, Subscription, combineLatest, firstValueFrom } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

import { DataService } from '../core/services/data.service';
import { StorageService } from '../core/services/storage.service';
import { AuthService } from '../core/services/auth.service';
import { AppIdentity, Book, Chapter } from '../core/models/app-config.model';
import { FooterComponent } from './footer.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    IonList,
    IonListHeader,
    IonItem,
    IonIcon,
    IonLabel,
    IonAccordionGroup,
    IonAccordion,
    FooterComponent
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="primary" class="sidebar-brand-toolbar">
        <div class="brand-container" *ngIf="identity$ | async as identity">
          <img
            *ngIf="identity.logoUrl"
            [src]="dataService.resolveMediaUrl(identity.logoUrl)"
            alt="App Logo"
            class="brand-logo" />
          <div class="brand-title">
            {{ localize(identity.appName) || identity.defaultAppName }}
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="sidebar-content">
      <ion-list lines="none" class="nav-section">
        <ion-item
          button
          detail="false"
          [class.active-menu-item]="(activePath$ | async) === '/dashboard'"
          (click)="navigateTo(['/dashboard'])">
          <ion-icon slot="start" name="home-outline" class="nav-icon"></ion-icon>
          <ion-label class="ion-text-wrap">{{ (uiText$ | async)?.['nav_dashboard'] || 'Dashboard' }}</ion-label>
        </ion-item>

        <ion-item
          button
          detail="false"
          [class.active-menu-item]="(activePath$ | async) === '/bookmarks'"
          (click)="navigateTo(['/bookmarks'])">
          <ion-icon slot="start" name="bookmark-outline" class="nav-icon"></ion-icon>
          <ion-label class="ion-text-wrap">{{ (uiText$ | async)?.['nav_bookmarks'] || 'Bookmarks' }}</ion-label>
        </ion-item>

        <ion-item
          *ngIf="(calendarEnabled$ | async) !== false"
          button
          detail="false"
          [class.active-menu-item]="(activePath$ | async) === '/tippani'"
          (click)="navigateTo(['/tippani'])">
          <ion-icon slot="start" name="calendar-outline" class="nav-icon"></ion-icon>
          <ion-label class="ion-text-wrap">{{ (uiText$ | async)?.['nav_tippani'] || 'Calendar' }}</ion-label>
        </ion-item>

        <ion-item
          button
          detail="false"
          [class.active-menu-item]="(activePath$ | async) === '/about'"
          (click)="navigateTo(['/about'])">
          <ion-icon slot="start" name="information-circle-outline" class="nav-icon"></ion-icon>
          <ion-label class="ion-text-wrap">{{ (uiText$ | async)?.['nav_about'] || 'About Us' }}</ion-label>
        </ion-item>

        <ion-item
          *ngIf="canLogout"
          button
          detail="false"
          (click)="onLogoutClick()">
          <ion-icon slot="start" name="log-out-outline" class="nav-icon"></ion-icon>
          <ion-label class="ion-text-wrap">{{ (uiText$ | async)?.['nav_logout'] || 'Switch Account / Logout' }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list lines="none" class="book-tree-section" *ngIf="(visibleBooks$ | async) as books">
        <ion-list-header>
          <ion-label class="tree-section-header">
            {{ (uiText$ | async)?.['nav_books_header'] || 'Books & Chapters' }}
          </ion-label>
        </ion-list-header>

        <ion-accordion-group [value]="activeBookId$ | async" (ionChange)="onBookAccordionChange($event)">
          <ion-accordion
            *ngFor="let book of books; trackBy: trackByBookId"
            [value]="book.id"
            class="book-accordion">
            <ion-item
              slot="header"
              [class.active-book-header]="(activeBookId$ | async) === book.id">
              <ion-icon slot="start" name="book-outline" class="book-icon"></ion-icon>
              <ion-label class="ion-text-wrap book-title-label">
                {{ localize(book.title) }}
              </ion-label>
            </ion-item>

            <div class="ion-padding-start chapter-list" slot="content">
              <ion-item
                *ngFor="let chapter of book.chapters; trackBy: trackByChapterId"
                button
                detail="false"
                lines="none"
                class="chapter-item"
                [class.active-chapter-item]="isChapterActive(book.id, chapter.id, (activePath$ | async))"
                (click)="openChapter(book.id, chapter.id)">
                <ion-icon slot="start" name="document-text-outline" class="chapter-icon"></ion-icon>
                <ion-label class="ion-text-wrap">
                  {{ localize(chapter.title) }}
                </ion-label>
              </ion-item>
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </ion-list>
    </ion-content>

    <ion-footer class="ion-no-border sidebar-footer">
      <app-footer></app-footer>
    </ion-footer>
  `,
  styles: [`
    .sidebar-brand-toolbar {
      padding: calc(12px + var(--ion-safe-area-top, env(safe-area-inset-top, 0px))) 12px 14px;
    }
    .brand-container {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      object-fit: contain;
      background: rgba(255, 255, 255, 0.9);
      padding: 4px;
      flex-shrink: 0;
    }
    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0.2px;
      margin-top: 6px;
    }
    .nav-section {
      padding: 8px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .nav-icon,
    .book-icon,
    .chapter-icon {
      align-self: flex-start;
      margin-top: 12px;
    }
    .active-menu-item {
      --background: rgba(var(--ion-color-primary-rgb), 0.14);
      --color: var(--ion-color-primary);
      font-weight: 600;
      border-radius: 10px;
    }
    .active-menu-item ion-icon {
      color: var(--ion-color-primary);
    }
    .tree-section-header {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--ion-color-medium);
      margin-top: 8px;
    }
    .active-book-header {
      --color: var(--ion-color-primary);
      font-weight: 600;
    }
    .book-title-label {
      line-height: 1.42;
    }
    .chapter-list {
      background: rgba(var(--ion-color-primary-rgb), 0.03);
      padding-top: 4px;
      padding-bottom: 4px;
    }
    .chapter-item {
      --min-height: 40px;
      font-size: 0.92rem;
      line-height: 1.42;
      border-radius: 8px;
      margin: 2px 8px 2px 0;
    }
    .active-chapter-item {
      --background: var(--ion-color-primary);
      --color: var(--ion-color-primary-contrast, #ffffff);
      font-weight: 600;
    }
    .active-chapter-item .chapter-icon {
      color: var(--ion-color-primary-contrast, #ffffff);
    }
    .sidebar-footer {
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      background: var(--ion-card-background, #fff8ec);
    }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private menuCtrl = inject(MenuController);
  private alertCtrl = inject(AlertController);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);

  public identity$: Observable<AppIdentity> = this.dataService.identity$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;
  public visibleBooks$: Observable<Book[]> = this.dataService.visibleBooks$;
  public calendarEnabled$: Observable<boolean> = this.dataService.calendarEnabled$;

  public activePath$!: Observable<string>;
  public activeBookId$!: Observable<string | undefined>;

  private langSub?: Subscription;
  private currentLang = 'hi';

  constructor() {
    addIcons({
      homeOutline,
      bookmarkOutline,
      calendarOutline,
      informationCircleOutline,
      bookOutline,
      documentTextOutline,
      logOutOutline
    });
  }

  ngOnInit(): void {
    this.langSub = this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
    });

    this.activePath$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    );

    this.activeBookId$ = combineLatest([this.activePath$, this.visibleBooks$]).pipe(
      map(([path, _books]) => {
        if (path.startsWith('/reader/')) {
          const segments = path.split('/');
          return segments[2];
        }
        return undefined;
      })
    );
  }

  public localize(mapObj: Record<string, string> | undefined): string {
    return this.dataService.localizeField(mapObj, this.currentLang);
  }

  public isChapterActive(bookId: string, chapterId: string, activePath: string | null): boolean {
    if (!activePath) return false;
    return activePath === `/reader/${bookId}/${chapterId}`;
  }

  public async navigateTo(commands: string[]): Promise<void> {
    await this.router.navigate(commands);
    await this.menuCtrl.close();
  }

  public get canLogout(): boolean {
    return this.authService.isLoginRequired() && !!this.authService.getSessionSnapshot();
  }

  public async onLogoutClick(): Promise<void> {
    const uiText = await firstValueFrom(this.uiText$).catch(() => ({} as Record<string, string>));
    const alert = await this.alertCtrl.create({
      header: uiText['logout_confirm_title'] || 'Logout',
      message: uiText['logout_confirm_message'] || 'Are you sure you want to logout from this device?',
      buttons: [
        { text: uiText['cancel_button'] || 'Cancel', role: 'cancel' },
        {
          text: uiText['ok_button'] || 'OK',
          handler: async () => {
            await this.menuCtrl.close();
            await this.authService.logout();
          }
        }
      ]
    });
    await alert.present();
  }

  public async openChapter(bookId: string, chapterId: string): Promise<void> {
    await this.router.navigate(['/reader', bookId, chapterId]);
    await this.menuCtrl.close();
  }

  public trackByBookId(_index: number, book: Book): string {
    return book.id;
  }

  public trackByChapterId(_index: number, chapter: Chapter): string {
    return chapter.id;
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  public onBookAccordionChange(event: any): void {
    const val = event?.detail?.value;
    const ids: string[] = Array.isArray(val) ? val : val ? [String(val)] : [];
    for (const bookId of ids) {
      if (bookId) {
        this.dataService.ensureBookChaptersLoaded(bookId).catch(() => {});
      }
    }
  }

}
