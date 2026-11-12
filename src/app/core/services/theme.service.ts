import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AppIdentity, FontSizeScale } from '../models/app-config.model';
import { SecurityUtil } from '../utils/security.util';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly FONT_SCALE_MAP: Record<FontSizeScale, string> = {
    small: '0.88rem',
    medium: '1.05rem',
    large: '1.28rem'
  };

  private readonly LINE_HEIGHT_MAP: Record<FontSizeScale, string> = {
    small: '1.5',
    medium: '1.65',
    large: '1.8'
  };

  constructor(@Inject(DOCUMENT) private document: Document) {}

  public applyAppIdentityTheme(identity: AppIdentity): void {
    if (!identity?.theme) return;

    const root = this.document.documentElement;
    const { theme, watermarkUrl, logoUrl } = identity;

    const safePrimary = SecurityUtil.sanitizeHexColor(theme.primary, '#8B2635');
    const safeSecondary = SecurityUtil.sanitizeHexColor(theme.secondary, '#D4AF37');
    const safeTertiary = SecurityUtil.sanitizeHexColor(theme.tertiary, '#2E5A44');

    this.setIonicColorVariable(root, 'primary', safePrimary);
    this.setIonicColorVariable(root, 'secondary', safeSecondary);
    this.setIonicColorVariable(root, 'tertiary', safeTertiary);

    if (theme.background) {
      const safeBg = SecurityUtil.sanitizeHexColor(theme.background, '#FFFDF9');
      const bgRgb = this.hexToRgbString(safeBg);
      root.style.setProperty('--ion-background-color', safeBg);
      root.style.setProperty('--ion-background-color-rgb', bgRgb);
      root.style.setProperty('--app-background-color', safeBg);
    }

    if (theme.surface) {
      const safeSurface = SecurityUtil.sanitizeHexColor(theme.surface, '#FFF8EC');
      root.style.setProperty('--ion-card-background', safeSurface);
      root.style.setProperty('--ion-item-background', safeSurface);
      root.style.setProperty('--ion-toolbar-background', safePrimary);
      root.style.setProperty('--ion-toolbar-color', this.getContrastHex(safePrimary));
    }

    if (theme.textPrimary) {
      const safeText = SecurityUtil.sanitizeHexColor(theme.textPrimary, '#2C1810');
      root.style.setProperty('--ion-text-color', safeText);
      root.style.setProperty('--ion-text-color-rgb', this.hexToRgbString(safeText));
    }

    const rawWatermark = (watermarkUrl && watermarkUrl.trim().length > 0)
      ? watermarkUrl.trim()
      : (logoUrl && logoUrl.trim().length > 0 ? logoUrl.trim() : null);

    const safeWatermark = SecurityUtil.sanitizeCssUrl(rawWatermark);

    if (safeWatermark) {
      root.style.setProperty('--app-watermark-image', `url("${safeWatermark}")`);
    } else {
      root.style.setProperty('--app-watermark-image', 'none');
    }
  }

  public applyFontSize(scale: FontSizeScale): void {
    const root = this.document.documentElement;
    root.style.setProperty('--app-reader-font-size', this.FONT_SCALE_MAP[scale] ?? this.FONT_SCALE_MAP.medium);
    root.style.setProperty('--app-reader-line-height', this.LINE_HEIGHT_MAP[scale] ?? this.LINE_HEIGHT_MAP.medium);
    root.setAttribute('data-font-scale', scale);
  }

  private setIonicColorVariable(root: HTMLElement, name: string, hex: string): void {
    if (!hex) return;
    const cleanHex = hex.trim();
    const rgbString = this.hexToRgbString(cleanHex);
    const contrastHex = this.getContrastHex(cleanHex);
    const contrastRgb = this.hexToRgbString(contrastHex);
    const shadeHex = this.adjustBrightness(cleanHex, -12);
    const tintHex = this.adjustBrightness(cleanHex, 12);

    root.style.setProperty(`--ion-color-${name}`, cleanHex);
    root.style.setProperty(`--ion-color-${name}-rgb`, rgbString);
    root.style.setProperty(`--ion-color-${name}-contrast`, contrastHex);
    root.style.setProperty(`--ion-color-${name}-contrast-rgb`, contrastRgb);
    root.style.setProperty(`--ion-color-${name}-shade`, shadeHex);
    root.style.setProperty(`--ion-color-${name}-tint`, tintHex);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const sanitized = hex.replace('#', '');
    const fullHex = sanitized.length === 3
      ? sanitized.split('').map(c => c + c).join('')
      : sanitized;
    const num = parseInt(fullHex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  private hexToRgbString(hex: string): string {
    const { r, g, b } = this.hexToRgb(hex);
    return `${r}, ${g}, ${b}`;
  }

  private getContrastHex(hex: string): string {
    const { r, g, b } = this.hexToRgb(hex);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 145 ? '#1a1a1a' : '#ffffff';
  }

  private adjustBrightness(hex: string, percent: number): string {
    const { r, g, b } = this.hexToRgb(hex);
    const clamp = (val: number) => Math.min(255, Math.max(0, Math.round(val + (val * percent) / 100)));
    const toHex = (val: number) => clamp(val).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}