import { inject } from '@angular/core';
import { Routes, CanActivateFn, Router } from '@angular/router';
import { StorageService } from './core/services/storage.service';
import { ShellComponent } from './layout/shell.component';

export const onboardingGuard: CanActivateFn = async () => {
  const storageService = inject(StorageService);
  const router = inject(Router);

  // Await local preferences hydration before evaluating route
  await storageService.isReady();

  if (!storageService.hasCompletedOnboardingSnapshot()) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};

export const alreadyOnboardedGuard: CanActivateFn = async () => {
  const storageService = inject(StorageService);
  const router = inject(Router);

  await storageService.isReady();

  // If already onboarded, don't allow returning to onboarding on cold boot
  if (storageService.hasCompletedOnboardingSnapshot()) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

export const routes: Routes = [
  {
    path: 'onboarding',
    canActivate: [alreadyOnboardedGuard],
    loadComponent: () =>
      import('./pages/onboarding/onboarding.page').then(m => m.OnboardingPage)
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [onboardingGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then(m => m.DashboardPage)
      },
      {
        path: 'chapters/:bookId',
        loadComponent: () =>
          import('./pages/chapters/chapters.page').then(m => m.ChaptersPage)
      },
      {
        path: 'reader/:bookId/:chapterId',
        loadComponent: () =>
          import('./pages/reader/reader.page').then(m => m.ReaderPage)
      },
      {
        path: 'bookmarks',
        loadComponent: () =>
          import('./pages/bookmarks/bookmarks.page').then(m => m.BookmarksPage)
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./pages/about/about.page').then(m => m.AboutPage)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];