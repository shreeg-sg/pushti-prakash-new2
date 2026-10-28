import { Component } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, sparklesOutline } from 'ionicons/icons';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
  imports: [IonContent, IonButton, IonIcon, IonText],
})
export class WelcomePage {
  readonly appName = 'Pushti Prakash';
  readonly tagline = 'Welcome to your new app. Everything starts here.';
  started = false;

  constructor() {
    addIcons({ sparklesOutline, arrowForwardOutline });
  }

  getStarted(): void {
    this.started = true;
  }
}
