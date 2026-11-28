import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline,
  mailOutline,
  callOutline,
  locationOutline,
  idCardOutline,
  logInOutline,
  arrowForwardOutline
} from 'ionicons/icons';
import { Observable, Subscription } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { StorageService } from '../../core/services/storage.service';
import { AppIdentity, AuthConfig } from '../../core/models/app-config.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  public authService = inject(AuthService);
  public dataService = inject(DataService);
  private storageService = inject(StorageService);

  public identity$: Observable<AppIdentity> = this.dataService.identity$;
  public uiText$: Observable<Record<string, string>> = this.dataService.uiText$;

  public authConfig: AuthConfig | null = null;
  public selectedLang = 'en';

  public name = '';
  public email = '';
  public mobile = '';
  public state = '';
  public uniqueId = '';

  public isSubmitting = false;
  public errorMessage = '';

  private authCfgSub?: Subscription;
  private langSub?: Subscription;

  constructor() {
    addIcons({
      personOutline,
      mailOutline,
      callOutline,
      locationOutline,
      idCardOutline,
      logInOutline,
      arrowForwardOutline
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.storageService.isReady(), this.authService.isReady()]);
    this.selectedLang = this.storageService.getCurrentLanguageSnapshot() || 'en';
    this.authConfig = this.authService.getAuthConfig();

    this.langSub = this.storageService.selectedLanguage$.subscribe(lang => {
      if (lang) this.selectedLang = lang;
    });

    this.authCfgSub = this.dataService.authConfig$.subscribe(cfg => {
      this.authConfig = cfg;
    });

    if (!this.authService.isLoginRequired() || this.authService.isLoggedInSnapshot()) {
      await this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }

  public get requireUniqueId(): boolean {
    return this.authConfig?.requireUniqueId === true;
  }

  public getUniqueIdLabel(uiText: Record<string, string> | null): string {
    const custom = this.dataService.localizeField(this.authConfig?.uniqueIdLabel, this.selectedLang);
    if (custom) return custom;
    return uiText?.['login_unique_id_label'] || 'Roll Number / Unique ID';
  }

  public async onSubmit(uiText: Record<string, string> | null): Promise<void> {
    this.errorMessage = '';

    const cleanEmail = this.email.trim();
    const cleanUniqueId = this.uniqueId.trim();

    if (this.requireUniqueId) {
      // College / Org mode: ONLY Unique ID and Email are captured and mandatory
      if (!cleanUniqueId) {
        this.errorMessage =
          uiText?.['login_err_unique_id_required'] || `Please enter ${this.getUniqueIdLabel(uiText)}.`;
        return;
      }
      if (!this.authService.isValidEmail(cleanEmail)) {
        this.errorMessage = uiText?.['login_err_email'] || 'Please enter a valid email address.';
        return;
      }
    } else {
      // Temple / Open mode: Name, Email, Mobile, State are mandatory; Unique ID is hidden
      const cleanName = this.name.trim();
      const cleanMobile = this.mobile.trim();
      const cleanState = this.state.trim();

      if (!cleanName) {
        this.errorMessage = uiText?.['login_err_name'] || 'Please enter your full name.';
        return;
      }
      if (!this.authService.isValidEmail(cleanEmail)) {
        this.errorMessage = uiText?.['login_err_email'] || 'Please enter a valid email address.';
        return;
      }
      if (!this.authService.isValidMobile(cleanMobile)) {
        this.errorMessage =
          uiText?.['login_err_mobile'] || 'Please enter a valid 10 to 15 digit mobile number.';
        return;
      }
      if (!cleanState) {
        this.errorMessage = uiText?.['login_err_state'] || 'Please enter your state.';
        return;
      }
    }

    await this.performLogin(false, uiText);
  }

  private async performLogin(replaceExisting: boolean, uiText: Record<string, string> | null): Promise<void> {
    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const res = await this.authService.login(
        this.requireUniqueId
          ? {
              email: this.email,
              uniqueId: this.uniqueId
            }
          : {
              name: this.name,
              email: this.email,
              mobile: this.mobile,
              state: this.state
            },
        replaceExisting
      );

      if (res.success) {
        await this.router.navigate(['/dashboard'], { replaceUrl: true });
        return;
      }

      if (res.requiresConfirmation && !replaceExisting) {
        this.isSubmitting = false;
        await this.showTerminateOtherSessionsAlert(uiText);
        return;
      }

      this.errorMessage = this.resolveLocalizedError(res.errorCode, res.message, uiText);
    } finally {
      this.isSubmitting = false;
    }
  }

  private resolveLocalizedError(
    errorCode: string | undefined,
    fallbackMsg: string | undefined,
    uiText: Record<string, string> | null
  ): string {
    if (errorCode === 'INVALID_UNIQUE_ID') {
      return (
        uiText?.['login_err_invalid_unique_id'] ||
        'Invalid Unique ID or Email. Please verify with your organization.'
      );
    }
    if (errorCode === 'UNIQUE_ID_REQUIRED') {
      return uiText?.['login_err_unique_id_required'] || `Please enter ${this.getUniqueIdLabel(uiText)}.`;
    }
    if (errorCode === 'NETWORK_ERROR') {
      return (
        uiText?.['login_err_network'] ||
        'Unable to reach server. Please check your internet connection and try again.'
      );
    }
    return fallbackMsg || 'Unable to login. Please verify your details.';
  }

  private async showTerminateOtherSessionsAlert(uiText: Record<string, string> | null): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: uiText?.['login_other_device_title'] || 'Active Session Found',
      message: uiText?.['login_other_device_message'] || 'Your login session will terminate on other devices.',
      backdropDismiss: false,
      buttons: [
        {
          text: uiText?.['cancel_button'] || 'Cancel',
          role: 'cancel'
        },
        {
          text: uiText?.['ok_button'] || 'OK',
          handler: () => {
            this.performLogin(true, uiText);
          }
        }
      ]
    });

    await alert.present();
  }

  ngOnDestroy(): void {
    this.authCfgSub?.unsubscribe();
    this.langSub?.unsubscribe();
  }
}
