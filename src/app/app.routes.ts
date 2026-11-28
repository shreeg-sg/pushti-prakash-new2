import { inject } from '@angular/core';
import { Routes, CanActivateFn, Router } from '@angular/router';
import { StorageService } from './core/services/storage.service';
import { AuthService } from './core/services/auth.service';
import { ShellComponent } from './layout/shell.component';

export const onboardingGuard: CanActivateFn = async () => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const router = inject(Router);

  // Await local preferences hydration before evaluating route
  await Promise.all([storageService.isReady(), authService.isReady()]);

  if (!storageService.hasCompletedOnboardingSnapshot()) {
    return router.createUrlTree(['/onboarding']);
  }
  if (authService.isLoginRequired() && !authService.isLoggedInSnapshot()) {
    return router.createUrlTree(['/login']);
  }
  return true;
};

export const alreadyOnboardedGuard: CanActivateFn = async () => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const router = inject(Router);

  await Promise.all([storageService.isReady(), authService.isReady()]);

  // If already onboarded, don't allow returning to onboarding on cold boot
  if (storageService.hasCompletedOnboardingSnapshot()) {
    if (authService.isLoginRequired() && !authService.isLoggedInSnapshot()) {
      return router.createUrlTree(['/login']);
    }
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};

export const loginGuard: CanActivateFn = async () => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const router = inject(Router);

  await Promise.all([storageService.isReady(), authService.isReady()]);

  if (!storageService.hasCompletedOnboardingSnapshot()) {
    return router.createUrlTree(['/onboarding']);
  }
  if (!authService.isLoginRequired() || authService.isLoggedInSnapshot()) {
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
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent)
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
        path: 'tippani',
        loadComponent: () =>
          import('./pages/tippani/tippani.page').then(m => m.TippaniPage)
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
