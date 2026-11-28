import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

import { DataService } from '../core/services/data.service';
import { StorageService } from '../core/services/storage.service';
import { AppIdentity } from '../core/models/app-config.model';

@Component({
  selector: 'app-splash-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splash-overlay.component.html',
  styleUrls: ['./splash-overlay.component.scss']
})
export class SplashOverlayComponent {
  @Input() fadingOut = false;
  @Input() isSlowNetwork = false;

  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public identity$: Observable<AppIdentity> = this.dataService.identity$;
  public fallbackLogo = 'assets/images/logo.png';

  public getLogoUrl(identity: AppIdentity | null): string {
    if (identity?.logoUrl) {
      return this.dataService.resolveMediaUrl(identity.logoUrl);
    }
    return this.fallbackLogo;
  }

  public getAppTitle(identity: AppIdentity | null): string {
    if (!identity) return '';
    const lang = this.storageService.getCurrentLanguageSnapshot() || 'en';
    return this.dataService.localizeField(identity.appName, lang) || identity.defaultAppName || '';
  }

  public onLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img && !img.src.endsWith(this.fallbackLogo)) {
      img.src = this.fallbackLogo;
    }
  }
}
