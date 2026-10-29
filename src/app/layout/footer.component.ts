import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonFooter, IonToolbar } from '@ionic/angular/standalone';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, IonFooter, IonToolbar],
  template: `
    <ion-footer class="ion-no-border app-global-footer">
      <ion-toolbar class="footer-toolbar">
        <div class="footer-credit-text">
          v{{ appVersion }} | {{ developerCredit }}
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
  public readonly appVersion = environment.appVersion;
  public readonly developerCredit =
    environment.developerCredit || 'Developed by Sameer Purushottam Gujarathi';
}