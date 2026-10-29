import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  Platform,
  NavController,
  MenuController,
  ActionSheetController,
  ModalController,
  PopoverController,
  ToastController
} from '@ionic/angular/standalone';
import { App } from '@capacitor/app';
import { Subscription, firstValueFrom } from 'rxjs';

import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class BackButtonService implements OnDestroy {
  private backButtonSub?: Subscription;
  private lastBackPressTimestamp = 0;
  private readonly EXIT_CONFIRM_WINDOW_MS = 2000;
  private readonly ROOT_PATHS = ['/dashboard', '/onboarding', '/'];

  constructor(
    private platform: Platform,
    private router: Router,
    private navCtrl: NavController,
    private menuCtrl: MenuController,
    private actionSheetCtrl: ActionSheetController,
    private modalCtrl: ModalController,
    private popoverCtrl: PopoverController,
    private toastCtrl: ToastController,
    private dataService: DataService
  ) {}

  /**
   * Call once inside AppComponent.ngOnInit().
   */
  public initialize(): void {
    if (this.backButtonSub) return;

    this.backButtonSub = this.platform.backButton.subscribeWithPriority(10, async () => {
      await this.handleHardwareBackButton();
    });
  }

  private async handleHardwareBackButton(): Promise<void> {
    // 1. Dismiss open overlays (ActionSheet, Popover, Modal) if present
    const topActionSheet = await this.actionSheetCtrl.getTop();
    if (topActionSheet) {
      await topActionSheet.dismiss();
      return;
    }

    const topPopover = await this.popoverCtrl.getTop();
    if (topPopover) {
      await topPopover.dismiss();
      return;
    }

    const topModal = await this.modalCtrl.getTop();
    if (topModal) {
      await topModal.dismiss();
      return;
    }

    // 2. Close sidebar menu if open
    const isMenuOpen = await this.menuCtrl.isOpen();
    if (isMenuOpen) {
      await this.menuCtrl.close();
      return;
    }

    // 3. Check current URL to decide between intra-app back navigation vs double-tap exit
    const currentUrl = this.router.url.split('?')[0];
    const isRootRoute = this.ROOT_PATHS.includes(currentUrl);

    if (!isRootRoute) {
      this.navCtrl.back();
      return;
    }

    // 4. Double-tap to exit on root screens
    const now = Date.now();
    if (now - this.lastBackPressTimestamp < this.EXIT_CONFIRM_WINDOW_MS) {
      await App.exitApp();
    } else {
      this.lastBackPressTimestamp = now;
      await this.showExitToast();
    }
  }

  private async showExitToast(): Promise<void> {
    let message = 'Press back again to exit';
    try {
      const uiText = await firstValueFrom(this.dataService.uiText$);
      if (uiText?.['double_tap_exit']) {
        message = uiText['double_tap_exit'];
      }
    } catch {
      // Fallback to default English prompt if config stream isn't ready yet
    }

    const toast = await this.toastCtrl.create({
      message,
      duration: this.EXIT_CONFIRM_WINDOW_MS,
      position: 'bottom',
      color: 'dark'
    });
    await toast.present();
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
  }
}
