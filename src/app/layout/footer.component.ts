import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonFooter, IonToolbar } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { DataService } from '../core/services/data.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, IonFooter, IonToolbar],
  template: `
    <ion-footer class="ion-no-border app-global-footer">
      <ion-toolbar class="footer-toolbar">
        <div class="footer-credit-text">
          v{{ appVersion }} | {{ (footerCredit$ | async) || fallbackCredit }}
        </div>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [`
    .footer-toolbar {
      --min-height: 32px;
      --padding-top: 4px;
      --padding-bottom: 4px;
      --background: var(--ion-card-background, #fff8ec);
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }
    .footer-credit-text {
      text-align: center;
      font-size: 0.74rem;
      font-weight: 500;
      color: var(--ion-color-medium, #6e4f42);
      letter-spacing: 0.2px;
    }
  `]
})
export class FooterComponent {
  private dataService = inject(DataService);

  public readonly appVersion = environment.appVersion || '1.0.0';
  public readonly fallbackCredit = environment.developerCredit || 'PushtiPrakash Digital Platform';

  // Dynamically pulls tenant footer credit from remote app_identity.json if defined
  public readonly footerCredit$: Observable<string> = this.dataService.identity$.pipe(
    map(identity => (identity as any)?.footerCredit || (identity as any)?.developerCredit || this.fallbackCredit)
  );
}