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

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private storageService = inject(StorageService);

  private actionListener?: PluginListenerHandle;
  private isInitialized = false;

  public async initialize(): Promise<void> {
    if (this.isInitialized || !Capacitor.isNativePlatform()) return;
    this.isInitialized = true;

    this.actionListener = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      async (event: ActionPerformed) => {
        // Guarantee local storage is hydrated before routing so language doesn't reset
        await this.storageService.isReady();

        const extra = event.notification?.extra;
        if (extra?.targetBookId && extra?.targetChapterId) {
          this.ngZone.run(() => {
            this.router.navigate(['/reader', extra.targetBookId, extra.targetChapterId], {
              replaceUrl: false
            });
          });
        } else {
          this.ngZone.run(() => {
            this.router.navigate(['/dashboard']);
          });
        }
      }
    );
  }

  public async rescheduleNotifications(
    schedules: NotificationSchedule[],
    langCode: string
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
      const notificationsToSchedule: LocalNotificationSchema[] = [];

      for (const item of activeSchedules) {
        const iconConfig = {
          smallIcon: 'ic_launcher',
          largeIcon: 'ic_launcher',
          iconColor: '#8B2635'
        };

        if (item.date) {
          const [year, month, day] = item.date.split('-').map(Number);
          const targetDateTime = new Date(year, month - 1, day, item.hour || 8, item.minute || 0, 0);

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
                hour: item.hour,
                minute: item.minute
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