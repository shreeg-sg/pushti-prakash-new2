import { inject } from '@angular/core';
import { Routes, CanActivateFn, Router } from '@angular/router';
import { StorageService } from './core/services/storage.service';
import { ShellComponent } from './layout/shell.component';

export const onboardingGuard: CanActivateFn = () => {
  const storageService = inject(StorageService);
  const router = inject(Router);

  if (!storageService.hasCompletedOnboardingSnapshot()) {
    return router.createUrlTree(['/onboarding']);
  }
  return true;
};

export const routes: Routes = [
  {
    path: 'onboarding',
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
