import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthConfig } from '../models/app-config.model';
import { DataService } from './data.service';

export interface AuthSession {
  tenantId: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  name: string;
  email: string;
  mobile: string;
  state: string;
  uniqueId?: string;
  loggedInAt: string;
  lastOpenedAt: string;
  lastSyncedDate: string;
}

export interface LoginSubmission {
  name: string;
  email: string;
  mobile: string;
  state: string;
  uniqueId?: string;
}

export interface LoginResult {
  success: boolean;
  requiresConfirmation?: boolean;
  errorCode?:
    | 'INVALID_INPUT'
    | 'UNIQUE_ID_REQUIRED'
    | 'INVALID_UNIQUE_ID'
    | 'SESSION_EXISTS_OTHER_DEVICE'
    | 'CONFIG_MISSING'
    | 'NETWORK_ERROR';
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private dataService = inject(DataService);

  private readonly PREFIX = `wl_${environment.clientKey}_`;
  private readonly SESSION_KEY = `${this.PREFIX}auth_session`;
  private readonly DEVICE_ID_KEY = `${this.PREFIX}device_id`;

  private sessionSubject = new BehaviorSubject<AuthSession | null>(null);
  public readonly session$ = this.sessionSubject.asObservable();

  private initPromise: Promise<void> | null = null;
  private cachedDeviceId = '';

  public initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  public async isReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    } else {
      await this.initialize();
    }
    return true;
  }

  private async performInit(): Promise<void> {
    try {
      const [sessionRes, deviceRes] = await Promise.all([
        Preferences.get({ key: this.SESSION_KEY }),
        Preferences.get({ key: this.DEVICE_ID_KEY })
      ]);

      if (deviceRes.value) {
        this.cachedDeviceId = deviceRes.value;
      } else {
        this.cachedDeviceId = this.generateDeviceId();
        await Preferences.set({ key: this.DEVICE_ID_KEY, value: this.cachedDeviceId });
      }

      if (sessionRes.value) {
        const parsed = JSON.parse(sessionRes.value) as AuthSession;
        if (parsed && parsed.userId && parsed.email) {
          this.sessionSubject.next(parsed);
        }
      }
    } catch {
      this.sessionSubject.next(null);
    }
  }

  public getAuthConfig(): AuthConfig | null {
    return this.dataService.getAuthConfigSnapshot();
  }

  public isLoginRequired(): boolean {
    const cfg = this.getAuthConfig();
    if (!cfg || cfg.enabled !== true) {
      return false;
    }
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_PROJECT_REF'));
  }

  public isLoggedInSnapshot(): boolean {
    if (!this.isLoginRequired()) {
      return true;
    }
    const session = this.sessionSubject.value;
    if (!session) return false;
    if (this.isLocallyExpired(session)) {
      return false;
    }
    return true;
  }

  public getSessionSnapshot(): AuthSession | null {
    return this.sessionSubject.value;
  }

  private isLocallyExpired(session: AuthSession): boolean {
    const cfg = this.getAuthConfig();
    const expiryDays = Math.max(1, Number(cfg?.inactivityExpiryDays || 30));
    const lastMs = Date.parse(session.lastOpenedAt || session.loggedInAt || '');
    if (Number.isNaN(lastMs)) return true;
    const diffDays = (Date.now() - lastMs) / (1000 * 60 * 60 * 24);
    return diffDays > expiryDays;
  }

  public async clearSession(): Promise<void> {
    this.sessionSubject.next(null);
    await Preferences.remove({ key: this.SESSION_KEY });
  }

  /**
   * Called on app startup after local hydration.
   * - Checks 30-day local expiry immediately.
   * - Once per calendar day, pings Supabase to update last_opened_at and verify session wasn't replaced.
   */
  public async syncSessionOnStartup(): Promise<void> {
    await this.isReady();
    if (!this.isLoginRequired()) return;

    const session = this.sessionSubject.value;
    if (!session) return;

    if (this.isLocallyExpired(session)) {
      await this.clearSession();
      await this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    const today = this.getLocalDateString();
    if (session.lastSyncedDate === today) {
      return;
    }

    const cfg = this.getAuthConfig()!;
    try {
      const token = await this.ensureValidAccessToken(cfg, session);
      if (!token) return;

      const res = await this.callRpc<{ status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' }>(
        cfg,
        token,
        'ping_active_user',
        {
          p_tenant_id: this.resolveTenantId(cfg),
          p_device_id: this.cachedDeviceId,
          p_expiry_days: Math.max(1, Number(cfg.inactivityExpiryDays || 30))
        }
      );

      if (res?.status === 'EXPIRED' || res?.status === 'REVOKED') {
        await this.clearSession();
        await this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (res?.status === 'ACTIVE') {
        const updated: AuthSession = {
          ...session,
          lastOpenedAt: new Date().toISOString(),
          lastSyncedDate: today
        };
        this.sessionSubject.next(updated);
        await Preferences.set({ key: this.SESSION_KEY, value: JSON.stringify(updated) });
      }
    } catch {
      // Offline or transient network error: keep local session intact and retry next launch
    }
  }

  /**
   * Executes login flow:
   * 1. Validates fields & optional Unique ID (either from assets/{tenantName}/uniqueId.json or Supabase DB)
   * 2. Signs in anonymously to obtain a real Supabase JWT (auth.uid())
   * 3. Checks if email/uniqueId is already active on another device (unless replaceExisting = true)
   * 4. Calls complete_login RPC to activate user and record LOGIN / RE_LOGIN / SESSION_REPLACED in login_audit
   */
  public async login(payload: LoginSubmission, replaceExisting = false): Promise<LoginResult> {
    await this.isReady();
    const cfg = this.getAuthConfig();
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return { success: false, errorCode: 'CONFIG_MISSING', message: 'Login configuration is missing.' };
    }

    const cleanName = (payload.name || '').trim();
    const cleanEmail = (payload.email || '').trim().toLowerCase();
    const cleanMobile = (payload.mobile || '').trim();
    const cleanState = (payload.state || '').trim();
    const cleanUniqueId = (payload.uniqueId || '').trim();

    if (!cleanName || !this.isValidEmail(cleanEmail) || !this.isValidMobile(cleanMobile) || !cleanState) {
      return { success: false, errorCode: 'INVALID_INPUT', message: 'Please fill all required fields with valid details.' };
    }

    const requireUniqueId = cfg.requireUniqueId === true;
    const uniqueIdSource = cfg.uniqueIdSource || 'supabase';

    if (requireUniqueId && !cleanUniqueId) {
      return { success: false, errorCode: 'UNIQUE_ID_REQUIRED', message: 'Unique ID is required.' };
    }

    if (requireUniqueId && uniqueIdSource === 'json') {
      const jsonOk = await this.verifyUniqueIdFromJson(cfg, cleanUniqueId);
      if (!jsonOk) {
        return { success: false, errorCode: 'INVALID_UNIQUE_ID', message: 'Invalid Unique ID. Please check with your organization.' };
      }
    }

    try {
      const authTokens = await this.signInAnonymously(cfg);
      if (!authTokens?.access_token || !authTokens?.user?.id) {
        return { success: false, errorCode: 'NETWORK_ERROR', message: 'Unable to reach authentication server.' };
      }

      const tenantId = this.resolveTenantId(cfg);

      if (!replaceExisting) {
        const check = await this.callRpc<{ exists: boolean; same_device: boolean }>(
          cfg,
          authTokens.access_token,
          'check_existing_session',
          {
            p_tenant_id: tenantId,
            p_email: cleanEmail,
            p_unique_id: cleanUniqueId || null,
            p_device_id: this.cachedDeviceId
          }
        );

        if (check?.exists && !check?.same_device) {
          return {
            success: false,
            requiresConfirmation: true,
            errorCode: 'SESSION_EXISTS_OTHER_DEVICE'
          };
        }
      }

      const result = await this.callRpc<{ success: boolean; error?: string; logged_in_at?: string }>(
        cfg,
        authTokens.access_token,
        'complete_login',
        {
          p_tenant_id: tenantId,
          p_name: cleanName,
          p_email: cleanEmail,
          p_mobile: cleanMobile,
          p_state: cleanState,
          p_unique_id: cleanUniqueId || null,
          p_device_id: this.cachedDeviceId,
          p_replace_existing: replaceExisting,
          p_require_unique_id_db: requireUniqueId && uniqueIdSource === 'supabase'
        }
      );

      if (!result?.success) {
        if (result?.error === 'SESSION_EXISTS_OTHER_DEVICE') {
          return {
            success: false,
            requiresConfirmation: true,
            errorCode: 'SESSION_EXISTS_OTHER_DEVICE'
          };
        }
        return {
          success: false,
          errorCode: (result?.error as any) || 'INVALID_INPUT',
          message: result?.error === 'INVALID_UNIQUE_ID'
            ? 'Invalid Unique ID. Please check with your organization.'
            : 'Unable to complete login.'
        };
      }

      const nowIso = new Date().toISOString();
      const newSession: AuthSession = {
        tenantId,
        userId: authTokens.user.id,
        deviceId: this.cachedDeviceId,
        accessToken: authTokens.access_token,
        refreshToken: authTokens.refresh_token || '',
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        state: cleanState,
        uniqueId: cleanUniqueId || undefined,
        loggedInAt: result.logged_in_at || nowIso,
        lastOpenedAt: nowIso,
        lastSyncedDate: this.getLocalDateString()
      };

      this.sessionSubject.next(newSession);
      await Preferences.set({ key: this.SESSION_KEY, value: JSON.stringify(newSession) });

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Network error during login. Please try again.'
      };
    }
  }

  private async verifyUniqueIdFromJson(cfg: AuthConfig, candidateId: string): Promise<boolean> {
    const tenantName = this.resolveTenantId(cfg);
    const relPath = (cfg.uniqueIdJsonPath || `assets/${tenantName}/uniqueId.json`).trim();
    const remoteUrl = this.dataService.resolveMediaUrl(relPath);
    const localFallbackUrl = relPath.startsWith('assets/') ? relPath : `assets/${tenantName}/uniqueId.json`;

    let data: any = null;
    if (remoteUrl && remoteUrl.startsWith('https://')) {
      data = await firstValueFrom(
        this.http.get<any>(remoteUrl).pipe(timeout(6000), catchError(() => of(null)))
      );
    }

    if (!data) {
      data = await firstValueFrom(
        this.http.get<any>(localFallbackUrl).pipe(timeout(3000), catchError(() => of(null)))
      );
    }

    if (!data) return false;

    const list: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data.ids)
        ? data.ids
        : Array.isArray(data.uniqueIds)
          ? data.uniqueIds
          : [];

    const target = candidateId.trim().toLowerCase();
    return list.some(item => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item).trim().toLowerCase() === target;
      }
      if (item && typeof item === 'object') {
        if (item.active === false || item.isActive === false) return false;
        const val = item.id ?? item.uniqueId ?? item.rollNo ?? '';
        return String(val).trim().toLowerCase() === target;
      }
      return false;
    });
  }

  private async signInAnonymously(cfg: AuthConfig): Promise<{
    access_token: string;
    refresh_token?: string;
    user: { id: string };
  } | null> {
    const baseUrl = cfg.supabaseUrl.replace(/\/+$/, '');
    const headers = new HttpHeaders({
      apikey: cfg.supabaseAnonKey,
      'Content-Type': 'application/json'
    });

    return firstValueFrom(
      this.http
        .post<any>(`${baseUrl}/auth/v1/signup`, {}, { headers })
        .pipe(timeout(10000))
    );
  }

  private async ensureValidAccessToken(cfg: AuthConfig, session: AuthSession): Promise<string | null> {
    if (session.accessToken && !this.isJwtExpired(session.accessToken)) {
      return session.accessToken;
    }
    if (!session.refreshToken) return null;

    try {
      const baseUrl = cfg.supabaseUrl.replace(/\/+$/, '');
      const headers = new HttpHeaders({
        apikey: cfg.supabaseAnonKey,
        'Content-Type': 'application/json'
      });
      const refreshed = await firstValueFrom(
        this.http
          .post<any>(
            `${baseUrl}/auth/v1/token?grant_type=refresh_token`,
            { refresh_token: session.refreshToken },
            { headers }
          )
          .pipe(timeout(8000))
      );

      if (refreshed?.access_token) {
        const updated: AuthSession = {
          ...session,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || session.refreshToken
        };
        this.sessionSubject.next(updated);
        await Preferences.set({ key: this.SESSION_KEY, value: JSON.stringify(updated) });
        return refreshed.access_token;
      }
    } catch {
      return null;
    }
    return null;
  }

  private isJwtExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload?.exp) return false;
      return Date.now() >= (payload.exp - 60) * 1000;
    } catch {
      return true;
    }
  }

  private callRpc<T>(cfg: AuthConfig, accessToken: string, fnName: string, body: Record<string, any>): Promise<T> {
    const baseUrl = cfg.supabaseUrl.replace(/\/+$/, '');
    const headers = new HttpHeaders({
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    });
    return firstValueFrom(
      this.http
        .post<T>(`${baseUrl}/rest/v1/rpc/${fnName}`, body, { headers })
        .pipe(timeout(10000))
    );
  }

  private resolveTenantId(cfg: AuthConfig): string {
    return (cfg.tenantId || environment.clientKey || 'default').trim();
  }

  public isValidEmail(email: string): boolean {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test((email || '').trim());
  }

  public isValidMobile(mobile: string): boolean {
    const digits = (mobile || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  private generateDeviceId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private getLocalDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
