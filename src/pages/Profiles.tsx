import { useEffect, useRef, useState } from 'preact/hooks';
import {
  HttpError,
  hasSavedSession,
  normalizeServer,
  pingServer,
  publicUsers,
  quickConnectEnabled,
  quickConnectStart,
  quickConnectWait,
  restoreSession,
  serverUrl,
  signIn,
} from '../api/client';
import type { PublicUser } from '../api/types';
import { t } from '../i18n';
import { focusFirst } from '../nav/spatial';
import { isTV } from '../platform';
import { Avatar, LanternMark } from '../ui/Header';
import { Img } from '../ui/Img';
import { Loading, Message } from '../ui/Loading';

export function Profiles({ onServer }: { onServer: () => void }) {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<PublicUser | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const [qcAvailable, setQcAvailable] = useState(false);
  const [qcCode, setQcCode] = useState<string | null>(null);
  const qcAbort = useRef<AbortController | null>(null);

  const load = () => {
    setFailed(false);
    publicUsers()
      .then(setUsers)
      .catch(() => setFailed(true));
    quickConnectEnabled().then(setQcAvailable);
  };
  useEffect(load, []);
  useEffect(() => () => qcAbort.current?.abort(), []);

  const startQuickConnect = async () => {
    setError('');
    try {
      const { Code, Secret } = await quickConnectStart();
      setQcCode(Code);
      qcAbort.current?.abort();
      const ctrl = new AbortController();
      qcAbort.current = ctrl;
      await quickConnectWait(Secret, ctrl.signal);
    } catch {
      if (!qcAbort.current?.signal.aborted) {
        setQcCode(null);
        setError(t('profiles.qcFailed'));
      }
    }
  };
  const stopQuickConnect = () => {
    qcAbort.current?.abort();
    setQcCode(null);
  };
  useEffect(() => {
    if (isTV) requestAnimationFrame(() => focusFirst());
  }, [users, picked, qcCode]);
  useEffect(() => {
    if (picked && !isTV) pwRef.current?.focus();
  }, [picked]);

  const tryLogin = async (user: PublicUser, pw: string) => {
    setBusy(true);
    setError('');
    try {
      await signIn(user.Name, pw);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        setPicked(user);
        if (pw) setError(t('profiles.wrong'));
      } else setError(t('common.offline'));
    } finally {
      setBusy(false);
    }
  };

  const choose = (user: PublicUser) => {
    if (hasSavedSession(user.Id) && restoreSession(user.Id)) return;
    if (!user.HasPassword) void tryLogin(user, '');
    else {
      setPicked(user);
      setPassword('');
      setError('');
    }
  };

  if (failed) return <Message text={t('common.offline')} action={{ label: t('common.retry'), run: load }} />;
  if (!users) return <Loading />;

  return (
    <main class="profiles" data-nav-layer>
      <div class="profiles-brand">
        <LanternMark size={40} />
      </div>
      {qcCode ? (
        <div class="password-form">
          <h1 class="profiles-title">{t('profiles.quickConnect')}</h1>
          <p class="qc-code" aria-live="polite">
            {qcCode}
          </p>
          <p class="setting-hint">{t('profiles.qcHint')}</p>
          <span class="spinner" />
          <button class="btn btn-ghost" data-nav data-nav-autofocus onClick={stopQuickConnect}>
            {t('common.back')}
          </button>
        </div>
      ) : !picked ? (
        <>
          <h1 class="profiles-title">{t('profiles.title')}</h1>
          <ul class="profiles-list">
            {users.map((u) => (
              <li key={u.Id}>
                <button class="profile" data-nav onClick={() => choose(u)} disabled={busy}>
                  {u.PrimaryImageTag ? (
                    <Img class="profile-img" src={`${serverUrl.value}/UserImage?userId=${u.Id}&tag=${u.PrimaryImageTag}&maxWidth=240`} />
                  ) : (
                    <Avatar name={u.Name} size={120} />
                  )}
                  <span class="profile-name">{u.Name}</span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p class="form-error">{error}</p>}
          <div class="button-row">
            {qcAvailable && (
              <button class="btn btn-secondary" data-nav onClick={startQuickConnect}>
                {t('profiles.quickConnect')}
              </button>
            )}
            <button class="btn btn-ghost profiles-server" data-nav onClick={onServer}>
              {t('profiles.manageServer')}
            </button>
          </div>
        </>
      ) : (
        <form
          class="password-form"
          onSubmit={(e) => {
            e.preventDefault();
            void tryLogin(picked, password);
          }}
        >
          <Avatar name={picked.Name} size={96} />
          <h1 class="profiles-title">{picked.Name}</h1>
          <input
            ref={pwRef}
            type="password"
            data-nav
            data-nav-autofocus
            placeholder={t('profiles.password')}
            value={password}
            autocomplete="current-password"
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
          {error && <p class="form-error">{error}</p>}
          <div class="button-row">
            <button type="submit" class="btn btn-primary" data-nav disabled={busy}>
              {t('profiles.signIn')}
            </button>
            <button type="button" class="btn btn-ghost" data-nav onClick={() => setPicked(null)}>
              {t('common.back')}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

export function ServerSetup({ initial, onDone }: { initial?: string; onDone: (url: string) => void }) {
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isTV) requestAnimationFrame(() => focusFirst());
  }, []);
  return (
    <main class="profiles" data-nav-layer>
      <div class="profiles-brand">
        <LanternMark size={40} />
      </div>
      <form
        class="password-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(false);
          const url = normalizeServer(value);
          const ok = await pingServer(url);
          setBusy(false);
          if (ok) onDone(url);
          else setError(true);
        }}
      >
        <h1 class="profiles-title">{t('server.title')}</h1>
        <input
          type="url"
          inputMode="url"
          data-nav
          data-nav-autofocus
          placeholder="http://192.168.x.x:8096"
          value={value}
          autocomplete="url"
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          aria-label={t('server.address')}
        />
        {error && <p class="form-error">{t('server.unreachable')}</p>}
        <div class="button-row">
          <button type="submit" class="btn btn-primary" data-nav disabled={busy || !value.trim()}>
            {t('server.connect')}
          </button>
        </div>
      </form>
    </main>
  );
}
