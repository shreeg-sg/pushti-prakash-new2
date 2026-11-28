import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  todayOutline,
  calendarOutline,
  notificationsOutline,
  sparklesOutline,
  arrowForwardOutline
} from 'ionicons/icons';
import { Observable, Subscription } from 'rxjs';

import { HeaderComponent } from '../../layout/header.component';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import {
  CalendarDayEntry,
  CalendarEventItem,
  CalendarMonthPayload,
  NotificationSchedule
} from '../../core/models/app-config.model';

interface CalendarGridCell {
  isCurrentMonth: boolean;
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  hinduShortLabel: string;
  hinduFullLabel: string;
  paksha: string;
  isHighlighted: boolean;
  hasEvents: boolean;
  dayEntry?: CalendarDayEntry;
}

interface SelectedDateEventView {
  id: string;
  title: string;
  description?: string;
  time?: string;
  category?: string;
  color?: string;
  targetBookId?: string;
  targetChapterId?: string;
}

@Component({
  selector: 'app-tippani',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    IonContent,
    IonIcon,
    IonSpinner
  ],
  template: `
    <app-header></app-header>

    <ion-content [scrollY]="false" class="tippani-page-content">
      <div class="tippani-split-container">
        <!-- TOP 60%: Annual Gregorian + Optional Hindu Calendar -->
        <section class="calendar-top-section">
          <!-- Month / Year Bar + Today Button -->
          <div class="calendar-toolbar">
            <button
              type="button"
              class="cal-nav-btn"
              aria-label="Previous month"
              (click)="changeMonth(-1)">
              <ion-icon name="chevron-back-outline"></ion-icon>
            </button>

            <div class="cal-title-group">
              <div class="cal-month-year-row">
                <span class="cal-month-name">{{ getMonthDisplayName(viewMonth) }}</span>
                <select
                  class="cal-year-select"
                  [value]="viewYear"
                  (change)="onYearSelect($event)"
                  aria-label="Select Year">
                  <option *ngFor="let yr of availableYears" [value]="yr" [selected]="yr === viewYear">
                    {{ yr }}
                  </option>
                </select>
              </div>
              <div class="cal-hindu-month" *ngIf="hinduMonthLabel">
                {{ hinduMonthLabel }}
              </div>
            </div>

            <div class="cal-right-controls">
              <button
                type="button"
                class="today-pill-btn"
                (click)="goToToday()">
                <ion-icon name="today-outline"></ion-icon>
                <span>{{ (uiText$ | async)?.['tippani_today'] || 'Today' }}</span>
              </button>

              <button
                type="button"
                class="cal-nav-btn"
                aria-label="Next month"
                (click)="changeMonth(1)">
                <ion-icon name="chevron-forward-outline"></ion-icon>
              </button>
            </div>
          </div>

          <!-- Weekday Header Row -->
          <div class="weekday-header-grid">
            <div
              class="weekday-cell"
              *ngFor="let wd of weekdayHeaders; let i = index"
              [class.sunday-header]="i === 0">
              {{ wd }}
            </div>
          </div>

          <!-- Calendar Days Grid -->
          <div class="calendar-days-grid" [style.gridTemplateRows]="'repeat(' + weekRowCount + ', 1fr)'">
            <button
              type="button"
              *ngFor="let cell of calendarCells; trackBy: trackByCellKey"
              class="date-cell"
              [class.empty-cell]="!cell.isCurrentMonth"
              [class.is-today]="cell.isToday"
              [class.is-selected]="cell.isSelected"
              [class.is-highlighted]="cell.isHighlighted && cell.isCurrentMonth"
              [class.no-sublabel]="!cell.hinduShortLabel"
              [disabled]="!cell.isCurrentMonth"
              (click)="selectDate(cell)">
              <ng-container *ngIf="cell.isCurrentMonth">
                <!-- Primary Gregorian Date (expands to 100% when no Hindu tithi or shortLabel is set) -->
                <div class="cell-primary-date">
                  <span class="gregorian-day-num">{{ cell.dayNumber }}</span>
                  <span class="event-indicator-dot" *ngIf="cell.hasEvents"></span>
                </div>

                <!-- Optional Hindu Tithi / Academic Short Label -->
                <div
                  class="cell-hindu-tithi"
                  *ngIf="cell.hinduShortLabel"
                  [class.paksha-shukla]="cell.paksha === 'shukla'"
                  [class.paksha-krishna]="cell.paksha === 'krishna'">
                  {{ cell.hinduShortLabel }}
                </div>
              </ng-container>
            </button>
          </div>
        </section>

        <!-- BOTTOM 40%: Selected Date Notifications & Events -->
        <section class="events-bottom-section">
          <div class="selected-date-bar">
            <div class="selected-date-left">
              <ion-icon name="calendar-outline" class="selected-date-icon"></ion-icon>
              <span class="selected-date-text">{{ formattedSelectedDate }}</span>
            </div>

            <span class="selected-hindu-chip" *ngIf="selectedHinduSummary">
              {{ selectedHinduSummary }}
            </span>
          </div>

          <div class="events-scroll-area">
            <div class="events-loading" *ngIf="isLoadingMonth">
              <ion-spinner name="crescent" color="primary"></ion-spinner>
            </div>

            <ng-container *ngIf="!isLoadingMonth">
              <div class="events-list" *ngIf="selectedDateEvents.length > 0; else emptyEventsTpl">
                <div
                  class="event-card"
                  *ngFor="let evt of selectedDateEvents; trackBy: trackByEventId"
                  [class.clickable-event]="!!evt.targetBookId"
                  (click)="onEventClick(evt)">
                  <div class="event-card-top">
                    <div class="event-title-wrap">
                      <ion-icon name="sparkles-outline" class="event-icon"></ion-icon>
                      <span class="event-title">{{ evt.title }}</span>
                    </div>
                    <div class="event-badges-right">
                      <span
                        class="event-category-badge"
                        *ngIf="evt.category"
                        [style.borderColor]="evt.color || null"
                        [style.color]="evt.color || null">
                        {{ evt.category }}
                      </span>
                      <span class="event-time-badge" *ngIf="evt.time">{{ evt.time }}</span>
                    </div>
                  </div>

                  <p class="event-description" *ngIf="evt.description">
                    {{ evt.description }}
                  </p>

                  <div class="event-action-hint" *ngIf="evt.targetBookId">
                    <span>{{ (uiText$ | async)?.['read_now'] || 'Read Now' }}</span>
                    <ion-icon name="arrow-forward-outline"></ion-icon>
                  </div>
                </div>
              </div>

              <ng-template #emptyEventsTpl>
                <div class="no-events-state">
                  <ion-icon name="notifications-outline" class="no-events-icon"></ion-icon>
                  <p class="no-events-text">
                    {{ (uiText$ | async)?.['tippani_no_events'] || 'No events or notifications for this date.' }}
                  </p>
                </div>
              </ng-template>
            </ng-container>
          </div>
        </section>
      </div>
    </ion-content>
  `,
  styles: [`
    .tippani-page-content {
      --background: var(--ion-background-color, #fffdf9);
    }

    .tippani-split-container {
      height: 100%;
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* TOP 60% CALENDAR SECTION */
    .calendar-top-section {
      height: 60%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 8px 10px 6px;
      background: var(--ion-card-background, #fff8ec);
      border-bottom: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.18);
      box-sizing: border-box;
    }

    .calendar-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 6px;
      flex-shrink: 0;
    }

    .cal-nav-btn {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
      background: rgba(var(--ion-color-primary-rgb), 0.08);
      color: var(--ion-color-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;

      &:active {
        background: rgba(var(--ion-color-primary-rgb), 0.18);
      }
    }

    .cal-title-group {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .cal-month-year-row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .cal-month-name {
      font-size: 1rem;
      font-weight: 800;
      color: var(--ion-color-primary);
      line-height: 1.2;
    }

    .cal-year-select {
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.24);
      border-radius: 8px;
      background: rgba(var(--ion-color-primary-rgb), 0.06);
      color: var(--ion-color-primary);
      font-size: 0.85rem;
      font-weight: 700;
      padding: 2px 6px;
      outline: none;
      cursor: pointer;
    }

    .cal-hindu-month {
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--ion-color-medium, #6e4f42);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .cal-right-controls {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .today-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 9px;
      border-radius: 10px;
      border: 1px solid var(--ion-color-primary);
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast, #ffffff);
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;

      ion-icon {
        font-size: 0.9rem;
      }

      &:active {
        opacity: 0.85;
      }
    }

    .weekday-header-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
      margin-bottom: 4px;
      flex-shrink: 0;
    }

    .weekday-cell {
      text-align: center;
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--ion-color-medium, #6e4f42);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 0;
    }

    .weekday-cell.sunday-header {
      color: var(--ion-color-primary);
    }

    .calendar-days-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
    }

    .date-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border-radius: 9px;
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.1);
      background: var(--ion-background-color, #fffdf9);
      color: var(--ion-text-color, #2c1810);
      cursor: pointer;
      min-height: 0;
      overflow: hidden;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .date-cell.empty-cell {
      background: transparent;
      border-color: transparent;
      cursor: default;
    }

    .date-cell.is-highlighted {
      background: rgba(var(--ion-color-secondary-rgb, 212, 175, 55), 0.18);
      border-color: rgba(var(--ion-color-secondary-rgb, 212, 175, 55), 0.7);
    }

    .date-cell.is-today {
      border: 1.5px solid var(--ion-color-primary);
      box-shadow: inset 0 0 0 1px rgba(var(--ion-color-primary-rgb), 0.25);
    }

    .date-cell.is-selected {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast, #ffffff);
    }

    /* 65% Primary Gregorian Date (centers cleanly at 100% when no tithi/shortLabel) */
    .cell-primary-date {
      flex: 0 0 65%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .date-cell.no-sublabel .cell-primary-date {
      flex: 1 1 100%;
    }

    .gregorian-day-num {
      font-size: clamp(0.84rem, 2.8vw, 1rem);
      font-weight: 700;
      line-height: 1;
    }

    .event-indicator-dot {
      position: absolute;
      top: 2px;
      right: 3px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--ion-color-primary);
    }

    .date-cell.is-selected .event-indicator-dot {
      background: #ffffff;
    }

    /* 35% Optional Hindu Tithi */
    .cell-hindu-tithi {
      flex: 0 0 35%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(0.54rem, 1.8vw, 0.65rem);
      font-weight: 600;
      line-height: 1;
      color: var(--ion-color-medium, #6e4f42);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 1px;
    }

    .cell-hindu-tithi.paksha-shukla {
      color: #a65c00;
    }

    .cell-hindu-tithi.paksha-krishna {
      color: #4a5568;
    }

    .date-cell.is-selected .cell-hindu-tithi {
      color: rgba(255, 255, 255, 0.92);
    }

    /* BOTTOM 40% SELECTED DATE EVENTS SECTION */
    .events-bottom-section {
      height: 40%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--ion-background-color, #fffdf9);
      overflow: hidden;
    }

    .selected-date-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 14px;
      background: rgba(var(--ion-color-primary-rgb), 0.06);
      border-bottom: 1px solid rgba(var(--ion-color-primary-rgb), 0.12);
      flex-shrink: 0;
    }

    .selected-date-left {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .selected-date-icon {
      font-size: 1rem;
      color: var(--ion-color-primary);
      flex-shrink: 0;
    }

    .selected-date-text {
      font-size: 0.86rem;
      font-weight: 700;
      color: var(--ion-text-color, #2c1810);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .selected-hindu-chip {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.12);
      padding: 3px 9px;
      border-radius: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 52%;
    }

    .events-scroll-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 10px 12px 16px;
      -webkit-overflow-scrolling: touch;
    }

    .events-loading {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .events-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .event-card {
      background: var(--ion-card-background, #fff8ec);
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.16);
      border-left: 4px solid var(--ion-color-primary);
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .event-card.clickable-event {
      cursor: pointer;

      &:active {
        opacity: 0.85;
      }
    }

    .event-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .event-title-wrap {
      display: inline-flex;
      align-items: flex-start;
      gap: 6px;
      flex: 1;
    }

    .event-icon {
      font-size: 0.95rem;
      color: var(--ion-color-primary);
      margin-top: 2px;
      flex-shrink: 0;
    }

    .event-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--ion-text-color, #2c1810);
      line-height: 1.35;
    }

    .event-badges-right {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .event-category-badge {
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--ion-color-secondary-shade, var(--ion-color-primary));
      border: 1px solid rgba(var(--ion-color-primary-rgb), 0.35);
      background: rgba(var(--ion-color-primary-rgb), 0.06);
      padding: 1px 6px;
      border-radius: 6px;
      white-space: nowrap;
    }

    .event-time-badge {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      padding: 2px 7px;
      border-radius: 8px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .event-description {
      margin: 5px 0 0 22px;
      font-size: 0.8rem;
      line-height: 1.45;
      color: var(--ion-color-medium, #6e4f42);
      white-space: pre-line;
    }

    .event-action-hint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 6px 0 0 22px;
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--ion-color-primary);
    }

    .no-events-state {
      height: 100%;
      min-height: 110px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--ion-color-medium, #6e4f42);
      padding: 12px;
    }

    .no-events-icon {
      font-size: 2rem;
      opacity: 0.45;
      margin-bottom: 6px;
    }

    .no-events-text {
      margin: 0;
      font-size: 0.84rem;
      opacity: 0.85;
    }
  `]
})
export class TippaniPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private dataService = inject(DataService);
  private storageService = inject(StorageService);

  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public viewYear = new Date().getFullYear();
  public viewMonth = new Date().getMonth(); // 0..11
  public selectedDateKey = '';
  public availableYears: number[] = [];

  public calendarCells: CalendarGridCell[] = [];
  public weekRowCount = 6;
  public hinduMonthLabel = '';
  public formattedSelectedDate = '';
  public selectedHinduSummary = '';
  public selectedDateEvents: SelectedDateEventView[] = [];
  public isLoadingMonth = false;

  private currentMonthPayload: CalendarMonthPayload | null = null;
  private notificationSchedules: NotificationSchedule[] = [];
  private uiTextSnapshot: Record<string, string> = {};
  private currentLang = 'hi';

  private langSub?: Subscription;
  private cfgSub?: Subscription;
  private uiSub?: Subscription;

  private readonly WEEKDAYS_BY_LANG: Record<string, string[]> = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
    gu: ['રવિ', 'સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ']
  };

  private readonly MONTHS_BY_LANG: Record<string, string[]> = {
    en: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ],
    hi: [
      'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
      'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
    ],
    gu: [
      'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન',
      'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'
    ]
  };

  public get weekdayHeaders(): string[] {
    return this.WEEKDAYS_BY_LANG[this.currentLang] || this.WEEKDAYS_BY_LANG['en'];
  }

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronForwardOutline,
      todayOutline,
      calendarOutline,
      notificationsOutline,
      sparklesOutline,
      arrowForwardOutline
    });
  }

  ngOnInit(): void {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.selectedDateKey = this.formatDateKey(this.viewYear, this.viewMonth, now.getDate());

    // Build annual year selector range (5 years back to 5 years forward)
    this.availableYears = [];
    for (let y = this.viewYear - 5; y <= this.viewYear + 5; y++) {
      this.availableYears.push(y);
    }

    this.langSub = this.storageService.selectedLanguage$.subscribe(lang => {
      this.currentLang = lang;
      this.rebuildCalendarView();
    });

    this.uiSub = this.dataService.uiText$.subscribe(ui => {
      this.uiTextSnapshot = ui || {};
      this.updateSelectedDateDetails();
    });

    this.cfgSub = this.dataService.config$.subscribe(cfg => {
      this.notificationSchedules = Array.isArray(cfg?.notification_schedules)
        ? cfg.notification_schedules
        : [];
      this.rebuildCalendarView();
    });

    this.loadActiveMonthData();
  }

  public getMonthDisplayName(monthIndex: number): string {
    const list = this.MONTHS_BY_LANG[this.currentLang] || this.MONTHS_BY_LANG['en'];
    return list[monthIndex] || this.MONTHS_BY_LANG['en'][monthIndex] || '';
  }

  public changeMonth(delta: number): void {
    let nextMonth = this.viewMonth + delta;
    let nextYear = this.viewYear;

    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }

    if (!this.availableYears.includes(nextYear)) {
      this.availableYears = [...this.availableYears, nextYear].sort((a, b) => a - b);
    }

    this.viewYear = nextYear;
    this.viewMonth = nextMonth;
    this.selectedDateKey = this.formatDateKey(this.viewYear, this.viewMonth, 1);
    this.loadActiveMonthData();
  }

  public onYearSelect(event: Event): void {
    const selectedYear = Number((event.target as HTMLSelectElement)?.value);
    if (!Number.isInteger(selectedYear)) return;
    this.viewYear = selectedYear;
    this.selectedDateKey = this.formatDateKey(this.viewYear, this.viewMonth, 1);
    this.loadActiveMonthData();
  }

  public goToToday(): void {
    const now = new Date();
    const needsReload = this.viewYear !== now.getFullYear() || this.viewMonth !== now.getMonth();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.selectedDateKey = this.formatDateKey(this.viewYear, this.viewMonth, now.getDate());

    if (needsReload) {
      this.loadActiveMonthData();
    } else {
      this.rebuildCalendarView();
    }
  }

  public selectDate(cell: CalendarGridCell): void {
    if (!cell.isCurrentMonth) return;
    this.selectedDateKey = cell.dateKey;
    for (const c of this.calendarCells) {
      c.isSelected = c.isCurrentMonth && c.dateKey === this.selectedDateKey;
    }
    this.updateSelectedDateDetails();
  }

  public onEventClick(evt: SelectedDateEventView): void {
    if (!evt.targetBookId) return;
    if (evt.targetChapterId) {
      this.router.navigate(['/reader', evt.targetBookId, evt.targetChapterId]);
    } else {
      this.router.navigate(['/chapters', evt.targetBookId]);
    }
  }

  public trackByCellKey(_index: number, cell: CalendarGridCell): string {
    return cell.dateKey;
  }

  public trackByEventId(_index: number, evt: SelectedDateEventView): string {
    return evt.id;
  }

  private async loadActiveMonthData(): Promise<void> {
    this.isLoadingMonth = true;
    const requestedYear = this.viewYear;
    const requestedMonth = this.viewMonth;

    // Render Gregorian skeleton immediately while JSON loads
    this.currentMonthPayload = null;
    this.rebuildCalendarView();

    const payload = await this.dataService.loadCalendarMonth(requestedYear, requestedMonth);

    // Guard against rapid month switching race conditions
    if (this.viewYear !== requestedYear || this.viewMonth !== requestedMonth) {
      return;
    }

    this.currentMonthPayload = payload;
    this.isLoadingMonth = false;
    this.rebuildCalendarView();
  }

  private rebuildCalendarView(): void {
    const year = this.viewYear;
    const month = this.viewMonth;
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayKey = this.formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    // Build lookup map from loaded monthly JSON (if available)
    const dayEntryMap = new Map<number, CalendarDayEntry>();
    if (this.currentMonthPayload?.days && Array.isArray(this.currentMonthPayload.days)) {
      for (const entry of this.currentMonthPayload.days) {
        if (!entry) continue;
        const dNum = Number(entry.day);
        if (Number.isInteger(dNum) && dNum >= 1 && dNum <= 31) {
          dayEntryMap.set(dNum, entry);
        }
      }
    }

    this.hinduMonthLabel = this.currentMonthPayload?.hinduMonth
      ? this.dataService.localizeFlexibleField(this.currentMonthPayload.hinduMonth, this.currentLang)
      : '';

    const cells: CalendarGridCell[] = [];

    // Leading empty slots before day 1
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({
        isCurrentMonth: false,
        dateKey: `empty_start_${year}_${month}_${i}`,
        dayNumber: 0,
        isToday: false,
        isSelected: false,
        hinduShortLabel: '',
        hinduFullLabel: '',
        paksha: '',
        isHighlighted: false,
        hasEvents: false
      });
    }

    // Actual days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = this.formatDateKey(year, month, day);
      const entry = dayEntryMap.get(day);
      const pakshaNorm = this.normalizePaksha(entry?.paksha);
      const hinduFull = entry?.hinduDay
        ? this.dataService.localizeFlexibleField(entry.hinduDay, this.currentLang)
        : '';
      const hinduShort = entry?.hinduTithiShort
        ? this.dataService.localizeFlexibleField(entry.hinduTithiShort, this.currentLang)
        : entry?.shortLabel
          ? this.dataService.localizeFlexibleField(entry.shortLabel, this.currentLang)
          : this.buildCompactTithi(hinduFull, pakshaNorm);

      const jsonEventsCount = Array.isArray(entry?.events) ? entry!.events!.length : 0;
      const rangeEventsCount = this.getMultiDayRangeEventsForDate(dateKey).length;
      const scheduleEventsCount = this.getScheduledNotificationsForDate(dateKey).length;

      cells.push({
        isCurrentMonth: true,
        dateKey,
        dayNumber: day,
        isToday: dateKey === todayKey,
        isSelected: dateKey === this.selectedDateKey,
        hinduShortLabel: hinduShort,
        hinduFullLabel: hinduFull,
        paksha: pakshaNorm,
        isHighlighted: entry?.isHighlighted === true || entry?.highlight === true || rangeEventsCount > 0,
        hasEvents: jsonEventsCount > 0 || rangeEventsCount > 0 || scheduleEventsCount > 0,
        dayEntry: entry
      });
    }

    // Trailing empty slots to complete the final week row
    const totalRows = Math.ceil(cells.length / 7);
    this.weekRowCount = totalRows;
    const targetCells = totalRows * 7;
    for (let i = cells.length; i < targetCells; i++) {
      cells.push({
        isCurrentMonth: false,
        dateKey: `empty_end_${year}_${month}_${i}`,
        dayNumber: 0,
        isToday: false,
        isSelected: false,
        hinduShortLabel: '',
        hinduFullLabel: '',
        paksha: '',
        isHighlighted: false,
        hasEvents: false
      });
    }

    this.calendarCells = cells;
    this.updateSelectedDateDetails();
  }

  private updateSelectedDateDetails(): void {
    const selectedCell = this.calendarCells.find(c => c.isCurrentMonth && c.dateKey === this.selectedDateKey);

    // Format Gregorian display date
    const [y, m, d] = this.selectedDateKey.split('-').map(Number);
    if (y && m && d) {
      const dateObj = new Date(y, m - 1, d);
      const wdName = this.weekdayHeaders[dateObj.getDay()] || '';
      const mName = this.getMonthDisplayName(m - 1);
      this.formattedSelectedDate = `${wdName}, ${d} ${mName} ${y}`;
    } else {
      this.formattedSelectedDate = this.selectedDateKey;
    }

    // Build Hindu Tithi + Paksha summary chip (if present)
    if (selectedCell && (selectedCell.hinduFullLabel || selectedCell.paksha)) {
      const pakshaText = this.getLocalizedPaksha(selectedCell.paksha);
      this.selectedHinduSummary = [pakshaText, selectedCell.hinduFullLabel]
        .filter(Boolean)
        .join(' • ');
    } else {
      this.selectedHinduSummary = '';
    }

    // Collect events from monthly calendar JSON + any date-matched NotificationSchedules
    const events: SelectedDateEventView[] = [];
    const seenTitles = new Set<string>();

    const rawJsonEvents = selectedCell?.dayEntry?.events;
    if (Array.isArray(rawJsonEvents)) {
      rawJsonEvents.forEach((rawEvt, idx) => {
        if (typeof rawEvt === 'string') {
          const clean = rawEvt.trim();
          if (clean) {
            seenTitles.add(clean.toLowerCase());
            events.push({ id: `cal_${this.selectedDateKey}_${idx}`, title: clean });
          }
        } else if (rawEvt && typeof rawEvt === 'object') {
          const evtObj = rawEvt as CalendarEventItem;
          const title = this.dataService.localizeFlexibleField(evtObj.title, this.currentLang);
          if (title) {
            seenTitles.add(title.toLowerCase());
            events.push({
              id: evtObj.id ? String(evtObj.id) : `cal_${this.selectedDateKey}_${idx}`,
              title,
              description: this.dataService.localizeFlexibleField(evtObj.description, this.currentLang) || undefined,
              time: evtObj.time || undefined,
              category: evtObj.category || undefined,
              color: evtObj.color || undefined,
              targetBookId: evtObj.targetBookId || undefined,
              targetChapterId: evtObj.targetChapterId || undefined
            });
          }
        }
      });
    }

    // Append multi-day academic/org range events (where start day <= selectedDateKey <= endDate)
    const rangeEvents = this.getMultiDayRangeEventsForDate(this.selectedDateKey);
    rangeEvents.forEach((evtObj, idx) => {
      const title = this.dataService.localizeFlexibleField(evtObj.title, this.currentLang);
      if (!title || seenTitles.has(title.toLowerCase())) return;
      seenTitles.add(title.toLowerCase());
      events.push({
        id: evtObj.id ? `${evtObj.id}_range_${this.selectedDateKey}` : `range_${this.selectedDateKey}_${idx}`,
        title,
        description: this.dataService.localizeFlexibleField(evtObj.description, this.currentLang) || undefined,
        time: evtObj.time || undefined,
        category: evtObj.category || undefined,
        color: evtObj.color || undefined,
        targetBookId: evtObj.targetBookId || undefined,
        targetChapterId: evtObj.targetChapterId || undefined
      });
    });

    // Append date-specific notifications from notification_schedules.json if not duplicated
    const scheduled = this.getScheduledNotificationsForDate(this.selectedDateKey);
    for (const sched of scheduled) {
      const title = this.dataService.localizeField(sched.title, this.currentLang);
      if (!title || seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());
      const body = this.dataService.localizeField(sched.body, this.currentLang);
      const timeStr = this.formatScheduleTime(sched.hour, sched.minute);
      events.push({
        id: `sched_${sched.id}`,
        title,
        description: body || undefined,
        time: timeStr,
        targetBookId: sched.targetBookId,
        targetChapterId: sched.targetChapterId
      });
    }

    this.selectedDateEvents = events;
  }

  private getMultiDayRangeEventsForDate(dateKey: string): CalendarEventItem[] {
    const matched: CalendarEventItem[] = [];
    const days = this.currentMonthPayload?.days;
    if (!Array.isArray(days)) return matched;
    for (const d of days) {
      if (!d || !Array.isArray(d.events)) continue;
      const startKey = d.id || this.formatDateKey(this.viewYear, this.viewMonth, Number(d.day));
      if (!startKey || startKey === dateKey || dateKey < startKey) continue;
      for (const rawEvt of d.events) {
        if (rawEvt && typeof rawEvt === 'object' && (rawEvt as CalendarEventItem).endDate) {
          const endKey = String((rawEvt as CalendarEventItem).endDate).trim();
          if (endKey && dateKey <= endKey) {
            matched.push(rawEvt as CalendarEventItem);
          }
        }
      }
    }
    return matched;
  }

  private getScheduledNotificationsForDate(dateKey: string): NotificationSchedule[] {
    return this.notificationSchedules.filter(
      s => s && s.isEnabled !== false && s.date === dateKey
    );
  }

  private normalizePaksha(raw: string | undefined): string {
    if (!raw || typeof raw !== 'string') return '';
    const lower = raw.trim().toLowerCase();
    if (lower.includes('shukla') || lower.includes('sudi') || lower.includes('sud') || lower.includes('शुक्ल') || lower.includes('સુદ')) {
      return 'shukla';
    }
    if (lower.includes('krishna') || lower.includes('vadi') || lower.includes('vad') || lower.includes('कृष्ण') || lower.includes('વદ')) {
      return 'krishna';
    }
    return '';
  }

  private getLocalizedPaksha(pakshaNorm: string): string {
    if (pakshaNorm === 'shukla') {
      return this.uiTextSnapshot['paksha_shukla'] || (this.currentLang === 'hi' ? 'शुक्ल पक्ष' : this.currentLang === 'gu' ? 'સુદ' : 'Shukla Paksha');
    }
    if (pakshaNorm === 'krishna') {
      return this.uiTextSnapshot['paksha_krishna'] || (this.currentLang === 'hi' ? 'कृष्ण पक्ष' : this.currentLang === 'gu' ? 'વદ' : 'Krishna Paksha');
    }
    return '';
  }

  private buildCompactTithi(hinduFull: string, pakshaNorm: string): string {
    if (!hinduFull) return '';
    const prefix = pakshaNorm === 'shukla'
      ? (this.currentLang === 'hi' ? 'शु.' : this.currentLang === 'gu' ? 'સુદ ' : 'S.')
      : pakshaNorm === 'krishna'
        ? (this.currentLang === 'hi' ? 'कृ.' : this.currentLang === 'gu' ? 'વદ ' : 'K.')
        : '';
    const trimmed = hinduFull.length > 7 ? `${hinduFull.slice(0, 6)}…` : hinduFull;
    return `${prefix}${trimmed}`;
  }

  private formatScheduleTime(hour?: number, minute?: number): string {
    if (hour === undefined || hour === null) return '';
    const h = Number(hour);
    const m = Number(minute ?? 0);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  private formatDateKey(year: number, monthIndex: number, day: number): string {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
    this.cfgSub?.unsubscribe();
    this.uiSub?.unsubscribe();
  }
}
