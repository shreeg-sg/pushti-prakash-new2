import { Injectable } from '@angular/core';
import { ThemeConfig } from '../models/app-config.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
 applyTheme(theme: ThemeConfig): void {
 const root = document.documentElement;

 root.style.setProperty('--app-primary', theme.primary);
 root.style.setProperty('--app-secondary', theme.secondary);
 root.style.setProperty('--app-tertiary', theme.tertiary);
 root.style.setProperty('--app-background', theme.background);
 }

 applyFontSize(size: 'small' | 'medium' | 'large'): void {
 const scale = {
 small: '0.88',
 medium: '1',
 large: '1.18'
 }[size];

 document.documentElement.style.setProperty(
 '--reader-font-scale',
 scale
 );
 }
}
