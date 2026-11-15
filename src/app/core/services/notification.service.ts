import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  LocalNotifications,
  LocalNotificationSchema,
  ActionPerformed
} from '@capacitor/local-notifications';

import { NotificationSchedule } from '../models/app-config.model';
import { StorageService } from './storage.service';
import { SecurityUtil } from '../utils/security.util';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private storageService = inject(StorageService);

  private actionListener?: PluginListenerHandle;
  private isInitialized = false;
  private initPromise?: Promise<void>;

  private readonly CHANNEL_ID = 'daily_reminders';
  private readonly SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

  public initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await LocalNotifications.createChannel({
            id: this.CHANNEL_ID,
            name: 'Daily Reading & Festival Reminders',
            description: 'Scheduled daily reading and parva notifications',
            importance: 4,
            visibility: 1,
            vibration: true
          });
        } catch {}

        this.actionListener = await LocalNotifications.addListener(
          'localNotificationActionPerformed',
          async (event: ActionPerformed) => {
            await this.storageService.isReady();

            const extra = event.notification?.extra;
            const bookId = typeof extra?.targetBookId === 'string' && this.SAFE_ID_REGEX.test(extra.targetBookId)
              ? extra.targetBookId
              : '';
            const chapterId = typeof extra?.targetChapterId === 'string' && this.SAFE_ID_REGEX.test(extra.targetChapterId)
              ? extra.targetChapterId
              : '';

            this.ngZone.run(() => {
              if (bookId && chapterId) {
                this.router.navigate(['/reader', bookId, chapterId], { replaceUrl: false });
              } else if (bookId) {
                this.router.navigate(['/chapters', bookId], { replaceUrl: false });
              } else {
                this.router.navigate(['/dashboard']);
              }
            });
          }
        );
        this.isInitialized = true;
      })();
    }
    return this.initPromise;
  }

  public async rescheduleNotifications(
    schedules: NotificationSchedule[],
    langCode: string,
    themePrimaryColor = '#8B2635'
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this.initialize();

      let permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
        permStatus = await LocalNotifications.requestPermissions();
      }
      if (permStatus.display !== 'granted') return;

      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      const activeSchedules = (schedules || []).filter(item => item.isEnabled);
      if (activeSchedules.length === 0) return;

      const now = Date.now();
      const safeIconColor = SecurityUtil.sanitizeHexColor(themePrimaryColor, '#8B2635');
      const notificationsToSchedule: LocalNotificationSchema[] = [];

      for (const item of activeSchedules) {
        const iconConfig = {
          smallIcon: 'ic_stat_notify',
          largeIcon: 'ic_launcher',
          iconColor: safeIconColor,
          channelId: this.CHANNEL_ID
        };

        if (item.date) {
          const [year, month, day] = item.date.split('-').map(Number);
          const targetDateTime = new Date(year, month - 1, day, item.hour ?? 8, item.minute ?? 0, 0);

          if (targetDateTime.getTime() > now) {
            notificationsToSchedule.push({
              id: item.id,
              title: this.resolveText(item.title, langCode),
              body: this.resolveText(item.body, langCode),
              ...iconConfig,
              schedule: {
                at: targetDateTime,
                allowWhileIdle: true
              },
              extra: {
                targetBookId: item.targetBookId || null,
                targetChapterId: item.targetChapterId || null
              }
            });
          }
        } else {
          notificationsToSchedule.push({
            id: item.id,
            title: this.resolveText(item.title, langCode),
            body: this.resolveText(item.body, langCode),
            ...iconConfig,
            schedule: {
              on: {
                hour: item.hour ?? 7,
                minute: item.minute ?? 30
              },
              repeats: item.repeatsDaily ?? true,
              allowWhileIdle: true
            },
            extra: {
              targetBookId: item.targetBookId || null,
              targetChapterId: item.targetChapterId || null
            }
          });
        }
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule });
      }
    } catch (error) {
      console.warn('[NotificationService] Failed to reschedule notifications:', error);
    }
  }

  private resolveText(mapObj: Record<string, string> | undefined, langCode: string): string {
    if (!mapObj) return '';
    return mapObj[langCode] || mapObj['hi'] || mapObj['gu'] || mapObj['en'] || Object.values(mapObj)[0] || '';
  }

  ngOnDestroy(): void {
    this.actionListener?.remove();
  }
}