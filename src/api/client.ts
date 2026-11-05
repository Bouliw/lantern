import { signal } from '@preact/signals';
import { deviceLabel, isPackaged } from '../platform';
import type { PublicUser } from './types';

export const APP_NAME = 'Lantern';
export const APP_VERSION = '0.1.0';

const K = {
  server: 'lantern.server',
  device: 'lantern.deviceId',
  sessions: 'lantern.sessions',
  last: 'lantern.lastUser',
};

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function persist(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? (window as any).msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const deviceId: string = (() => {
  let id = load<string | null>(K.device, null);
  if (!id) {
    id = randomId();
    persist(K.device, id);
  }
  return id;
})();

export interface Session {
  server: string;
  userId: string;
  userName: string;
  token: string;
  isAdmin: boolean;
}

type SavedSessions = Record<string, Omit<Session, 'server' | 'userId'>>;

declare global {
  interface Window {
    LANTERN_CONFIG?: { server?: string };
  }
}

export const serverUrl = signal<string | null>(null);
export const session = signal<Session | null>(null);

export function normalizeServer(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  url = url.replace(/\/+$/, '');
  if (!/:\d+$/.test(url.replace(/^https?:\/\//i, '').split('/')[0]) && url.startsWith('http://')) url += ':8096';
  return url;
}

/** Works out which server to talk to, then restores the last profile used on this device. */
export function initServer(): string | null {
  const saved = load<string | null>(K.server, null);
  const configured = window.LANTERN_CONFIG?.server;
  const sameHost = isPackaged ? null : `${location.protocol}//${location.hostname}:8096`;
  const server = saved ?? configured ?? sameHost;
  serverUrl.value = server;
  if (server) {
    const last = load<string | null>(K.last, null);
    if (last) restoreSession(last);
  }
  return server;
}

export function setServer(url: string) {
  const clean = normalizeServer(url);
  persist(K.server, clean);
  serverUrl.value = clean;
  session.value = null;
}

export async function pingServer(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${url}/System/Info/Public`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const info = await res.json();
    return Boolean(info && info.Id);
  } catch {
    return false;
  }
}

export function authHeader(token?: string | null): string {
  const parts = [
    `Client="${APP_NAME}"`,
    `Device="${deviceLabel()}"`,
    `DeviceId="${deviceId}"`,
    `Version="${APP_VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return 'MediaBrowser ' + parts.join(', ');
}

export class HttpError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const k in query) {
    const v = query[k];
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Override the session token (null = anonymous). */
  token?: string | null;
  keepalive?: boolean;
  timeout?: number;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const base = serverUrl.value;
  if (!base) throw new HttpError(0, 'No server');
  const token = opts.token === undefined ? session.value?.token : opts.token;
  const headers: Record<string, string> = { Authorization: authHeader(token), Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(base + path + qs(opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      keepalive: opts.keepalive,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new HttpError(0, (err as Error).message);
  }
  clearTimeout(timer);
  if (res.status === 401 && token && session.value?.token === token) forgetSession(session.value.userId);
  if (!res.ok) throw new HttpError(res.status);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const userId = () => session.value?.userId ?? '';

// ---- Profiles ----------------------------------------------------------------

function sessionKey(userId: string) {
  return `${serverUrl.value}|${userId}`;
}

function savedSessions(): SavedSessions {
  return load<SavedSessions>(K.sessions, {});
}

export function hasSavedSession(userId: string): boolean {
  return Boolean(savedSessions()[sessionKey(userId)]);
}

export function restoreSession(userId: string): boolean {
  const saved = savedSessions()[sessionKey(userId)];
  if (!saved || !serverUrl.value) return false;
  session.value = { server: serverUrl.value, userId, ...saved };
  persist(K.last, userId);
  return true;
}

export function forgetSession(userId: string) {
  const all = savedSessions();
  delete all[sessionKey(userId)];
  persist(K.sessions, all);
  if (session.value?.userId === userId) session.value = null;
}

export async function publicUsers(): Promise<PublicUser[]> {
  return api<PublicUser[]>('/Users/Public', { token: null });
}

interface AuthResult {
  AccessToken: string;
  User: { Id: string; Name: string; Policy?: { IsAdministrator?: boolean } };
}

export async function signIn(name: string, password: string): Promise<Session> {
  const res = await api<AuthResult>('/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: name, Pw: password },
    token: null,
  });
  const s: Session = {
    server: serverUrl.value!,
    userId: res.User.Id,
    userName: res.User.Name,
    token: res.AccessToken,
    isAdmin: Boolean(res.User.Policy?.IsAdministrator),
  };
  const all = savedSessions();
  all[sessionKey(s.userId)] = { userName: s.userName, token: s.token, isAdmin: s.isAdmin };
  persist(K.sessions, all);
  persist(K.last, s.userId);
  session.value = s;
  return s;
}

/** Leaves the profile but keeps its token, so coming back needs no password. */
export function leaveProfile() {
  persist(K.last, null);
  session.value = null;
}

export async function signOut() {
  const s = session.value;
  if (!s) return;
  try {
    await api('/Sessions/Logout', { method: 'POST' });
  } catch {
    /* already gone */
  }
  forgetSession(s.userId);
  persist(K.last, null);
}
