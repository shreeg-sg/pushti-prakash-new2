import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  LocalNotifications,
  LocalNotificationSchema,
  ActionPerformed
} from '@capacitor/local-notifications';

import { NotificationSchedule } from '../models/app-config.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private actionListener?: PluginListenerHandle;
  private isInitialized = false;

  constructor(
    private router: Router,
    private ngZone: NgZone
  ) {}

  /**
   * Registers the tap listener for local notifications so deep links to books/chapters open cleanly.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized || !Capacitor.isNativePlatform()) return;
    this.isInitialized = true;

    this.actionListener = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event: ActionPerformed) => {
        const extra = event.notification?.extra;
        if (extra?.targetBookId && extra?.targetChapterId) {
          this.ngZone.run(() => {
            this.router.navigate(['/reader', extra.targetBookId, extra.targetChapterId]);
          });
        } else {
          this.ngZone.run(() => {
            this.router.navigate(['/dashboard']);
          });
        }
      }
    );
  }

  /**
   * Requests permission, clears old scheduled notifications, and schedules new ones from JSON.
   */
  public async rescheduleNotifications(
    schedules: NotificationSchedule[],
    langCode: string
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this.initialize();

      // 1. Check & request permissions
      let permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
        permStatus = await LocalNotifications.requestPermissions();
      }
      if (permStatus.display !== 'granted') {
        return;
      }

      // 2. Clear all previously pending notifications to avoid duplicates or stale schedules
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      // 3. Filter active schedules and map to Capacitor LocalNotificationSchema
      const activeSchedules = (schedules || []).filter(item => item.isEnabled);
      if (activeSchedules.length === 0) return;

      const notificationsToSchedule: LocalNotificationSchema[] = activeSchedules.map(item => ({
        id: item.id,
        title: this.resolveText(item.title, langCode),
        body: this.resolveText(item.body, langCode),
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
      }));

      await LocalNotifications.schedule({
        notifications: notificationsToSchedule
      });
    } catch (error) {
      console.warn('[NotificationService] Failed to reschedule local notifications:', error);
    }
  }

  private resolveText(mapObj: Record<string, string> | undefined, langCode: string): string {
    if (!mapObj) return '';
    return mapObj[langCode] || mapObj['en'] || mapObj['hi'] || Object.values(mapObj)[0] || '';
  }

  ngOnDestroy(): void {
    this.actionListener?.remove();
  }
}
