import { Injectable } from '@angular/core';
import {
 LocalNotifications,
 ScheduleOptions
} from '@capacitor/local-notifications';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
 constructor(private dataService: DataService) {}

 async initialize(): Promise<void> {
 const permission =
 await LocalNotifications.requestPermissions();

 if (permission.display !== 'granted') {
 return;
 }

 await this.scheduleFromConfig();
 }

 async scheduleFromConfig(): Promise<void> {
 const config = this.dataService.currentConfig;

 if (!config) {
 return;
 }

 await LocalNotifications.cancel({
 notifications: config.notification_schedules.map(item => ({
 id: item.id
 }))
 });

 const notifications = config.notification_schedules
.filter(item => item.enabled)
.map(item => {
 const scheduleAt = new Date(item.scheduleAt);

 return {
 id: item.id,
 title: item.title.en ?? 'Reminder',
 body: item.body.en ?? '',
 schedule: {
 at: scheduleAt,
 repeats: item.repeats && item.repeats !== 'none',
 every: item.repeats === 'day' ? 'day' : undefined
 },
 sound: undefined
 };
 });

 const options: ScheduleOptions = { notifications };
 await LocalNotifications.schedule(options);
 }
}
