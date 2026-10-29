import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { DataService } from './data.service';
import { ThemeService } from './theme.service';
import { StorageService } from './storage.service';
import { NotificationService } from './notification.service';
import { AppConfigPayload } from '../models/app-config.model';
import { environment } from '../../../environments/environment';

describe('DataService', () => {
  let service: DataService;
  let httpMock: HttpTestingController;
  let themeSpy: jasmine.SpyObj<ThemeService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let mockLangSubject: BehaviorSubject<string>;

  const samplePayload: AppConfigPayload = {
    schemaVersion: 1,
    lastUpdatedIso: '2026-10-29T15:30:00Z',
    updateBannerMessage: { hi: 'नया अपडेट', en: 'New Update' },
    app_identity: {
      defaultAppName: 'PushtiPrakash',
      appName: { hi: 'पुष्टिप्रकाश', en: 'PushtiPrakash' },
      logoUrl: 'https://example.com/logo.png',
      watermarkUrl: '',
      theme: {
        primary: '#8B2635',
        secondary: '#D4AF37',
        tertiary: '#2E5A44',
        background: '#FFFDF9'
      }
    },
    supportedLanguages: [
      { code: 'hi', name: 'हिन्दी', ttsLocale: 'hi-IN', isEnabled: true },
      { code: 'mr', name: 'मराठी', ttsLocale: 'mr-IN', isEnabled: false },
      { code: 'en', name: 'English', ttsLocale: 'en-IN', isEnabled: true }
    ],
    ui_translations: {
      nav_dashboard: { hi: 'मुख्य पृष्ठ', en: 'Dashboard' },
      english_only_key: { en: 'Fallback English Text' }
    },
    about_info: {
      description: { en: 'About text' },
      feedback_links: { en: 'https://forms.gle/en' }
    },
    books: [
      {
        id: 'b1',
        order: 1,
        isVisible: true,
        coverImageUrl: '',
        title: { hi: 'ग्रंथ १', en: 'Book 1' },
        chapters: [
          {
            id: 'c1',
            order: 1,
            isVisible: true,
            title: { hi: 'अध्याय १', en: 'Chapter 1' },
            transcript: { hi: 'पाठ १', en: 'Text 1' },
            audioUrl: { hi: '', en: '' }
          },
          {
            id: 'c2_hidden',
            order: 2,
            isVisible: false,
            title: { hi: 'छुपा अध्याय', en: 'Hidden Chapter' },
            transcript: { hi: '', en: '' },
            audioUrl: { hi: '', en: '' }
          }
        ]
      },
      {
        id: 'b2_hidden',
        order: 2,
        isVisible: false,
        coverImageUrl: '',
        title: { hi: 'छुपा ग्रंथ', en: 'Hidden Book' },
        chapters: []
      }
    ],
    notification_schedules: []
  };

  beforeEach(() => {
    mockLangSubject = new BehaviorSubject<string>('hi');
    themeSpy = jasmine.createSpyObj('ThemeService', ['applyAppIdentityTheme']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['rescheduleNotifications']);

    const storageStub: Partial<StorageService> = {
      selectedLanguage$: mockLangSubject.asObservable(),
      getCurrentLanguageSnapshot: () => mockLangSubject.value,
      setLanguage: jasmine.createSpy('setLanguage').and.resolveTo()
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DataService,
        { provide: ThemeService, useValue: themeSpy },
        { provide: StorageService, useValue: storageStub },
        { provide: NotificationService, useValue: notificationSpy }
      ]
    });

    service = TestBed.inject(DataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should filter out disabled languages and invisible books/chapters on remote sync', async () => {
    const syncPromise = service.syncWithFirebase();

    const req = httpMock.expectOne(r => r.url.startsWith(environment.firebaseConfigUrl));
    expect(req.request.method).toBe('GET');
    req.flush(samplePayload);

    const result = await syncPromise;
    expect(result).toBeTrue();
    expect(themeSpy.applyAppIdentityTheme).toHaveBeenCalledWith(samplePayload.app_identity);

    const enabledLangs = await firstValueFrom(service.enabledLanguages$);
    expect(enabledLangs.map(l => l.code)).toEqual(['hi', 'en']);

    const visibleBooks = await firstValueFrom(service.visibleBooks$);
    expect(visibleBooks.length).toBe(1);
    expect(visibleBooks[0].id).toBe('b1');
    expect(visibleBooks[0].chapters.length).toBe(1);
    expect(visibleBooks[0].chapters[0].id).toBe('c1');
  });

  it('should resolve UI translations for active language and fallback to English when key is missing', async () => {
    const syncPromise = service.syncWithFirebase();
    httpMock.expectOne(r => r.url.startsWith(environment.firebaseConfigUrl)).flush(samplePayload);
    await syncPromise;

    const uiTextHi = await firstValueFrom(service.uiText$);
    expect(uiTextHi['nav_dashboard']).toBe('मुख्य पृष्ठ');
    expect(uiTextHi['english_only_key']).toBe('Fallback English Text');
  });

  it('should fallback to bundled mock JSON when remote Firebase fetch fails and no cache exists', async () => {
    spyOn<any>(service, 'loadCachedConfig').and.resolveTo(null);

    const syncPromise = service.syncWithFirebase();

    const remoteReq = httpMock.expectOne(r => r.url.startsWith(environment.firebaseConfigUrl));
    remoteReq.error(new ProgressEvent('Network error'));

    // Expect fallback request to bundled assets/mock/data.json
    await new Promise(resolve => setTimeout(resolve, 0));
    const fallbackReq = httpMock.expectOne(environment.fallbackMockPath);
    fallbackReq.flush(samplePayload);

    const result = await syncPromise;
    expect(result).toBeFalse();

    const identity = await firstValueFrom(service.identity$);
    expect(identity.defaultAppName).toBe('PushtiPrakash');
  });
});
