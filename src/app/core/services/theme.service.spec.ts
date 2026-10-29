import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ThemeService } from './theme.service';
import { AppIdentity } from '../models/app-config.model';

describe('ThemeService', () => {
  let service: ThemeService;
  let doc: Document;

  const mockIdentity: AppIdentity = {
    defaultAppName: 'PushtiPrakash',
    appName: { hi: 'पुष्टिप्रकाश', en: 'PushtiPrakash' },
    logoUrl: 'https://example.com/logo.png',
    watermarkUrl: 'https://example.com/watermark.png',
    theme: {
      primary: '#8B2635',    // Dark maroon -> should yield white (#ffffff) contrast
      secondary: '#D4AF37',  // Bright gold -> should yield dark (#1a1a1a) contrast
      tertiary: '#2E5A44',
      background: '#FFFDF9',
      surface: '#FFF8EC',
      textPrimary: '#2C1810'
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ThemeService]
    });
    service = TestBed.inject(ThemeService);
    doc = TestBed.inject(DOCUMENT);
  });

  it('should inject primary, secondary, tertiary, and background CSS variables into :root', () => {
    service.applyAppIdentityTheme(mockIdentity);
    const rootStyle = doc.documentElement.style;

    expect(rootStyle.getPropertyValue('--ion-color-primary')).toBe('#8B2635');
    expect(rootStyle.getPropertyValue('--ion-color-primary-rgb')).toBe('139, 38, 53');
    expect(rootStyle.getPropertyValue('--ion-color-primary-contrast')).toBe('#ffffff');

    expect(rootStyle.getPropertyValue('--ion-color-secondary')).toBe('#D4AF37');
    expect(rootStyle.getPropertyValue('--ion-color-secondary-contrast')).toBe('#1a1a1a');

    expect(rootStyle.getPropertyValue('--ion-background-color')).toBe('#FFFDF9');
    expect(rootStyle.getPropertyValue('--app-watermark-image')).toContain('https://example.com/watermark.png');
  });

  it('should dynamically scale reader font size and line height for small, medium, and large', () => {
    const root = doc.documentElement;

    service.applyFontSize('large');
    expect(root.style.getPropertyValue('--app-reader-font-size')).toBe('1.28rem');
    expect(root.style.getPropertyValue('--app-reader-line-height')).toBe('1.8');
    expect(root.getAttribute('data-font-scale')).toBe('large');

    service.applyFontSize('small');
    expect(root.style.getPropertyValue('--app-reader-font-size')).toBe('0.88rem');
    expect(root.getAttribute('data-font-scale')).toBe('small');
  });
});
