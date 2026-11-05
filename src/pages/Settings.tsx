import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { APP_VERSION, leaveProfile, quickConnectApprove, serverUrl, session, signOut } from '../api/client';
import { clearCatalog } from '../api/catalog';
import { lang, langPref, t, type LangPref, type StringKey } from '../i18n';
import { isTV } from '../platform';
import { navigate } from '../router';
import {
  appearance,
  resetAppearance,
  resolvedParts,
  scope,
  setAppearance,
  setScope,
  type Appearance,
} from '../state/settings';
import { ACCENT_CHOICES, THEMES, THEME_ACCENT, type ThemeId } from '../themes/themes';
import { IconCheck } from '../ui/icons';

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="settings-section">
      <h2 class="settings-heading">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div class={'setting' + (disabled ? ' disabled' : '')}>
      <span class="setting-label">{label}</span>
      <div class="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            class={'segment' + (o.value === value ? ' active' : '')}
            data-nav={disabled ? undefined : true}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A tiny mock of the app drawn with the style's own colors, type and shapes. */
function ThemePreview({ palette, type, shape }: { palette: ThemeId; type: ThemeId; shape: ThemeId }) {
  return (
    <span class="theme-preview" data-palette={palette} data-type={type} data-shape={shape} aria-hidden="true">
      <span class="tp-bar">
        <span class="tp-dot" />
        <span class="tp-line" />
      </span>
      <span class="tp-hero">
        <span class="tp-head">Aa</span>
        <span class="tp-btn" />
      </span>
      <span class="tp-cards">
        <span class="tp-card" />
        <span class="tp-card" />
        <span class="tp-card" />
      </span>
    </span>
  );
}

function ThemeGrid({ a }: { a: Appearance }) {
  const choose = (theme: Appearance['theme']) => {
    if (theme === 'custom' && a.theme !== 'custom') setAppearance({ theme, custom: resolvedParts(a) });
    else setAppearance({ theme });
  };
  return (
    <div class="theme-grid" role="radiogroup" aria-label={t('settings.style')}>
      {THEMES.map((id) => (
        <button
          key={id}
          role="radio"
          aria-checked={a.theme === id}
          class={'theme-option' + (a.theme === id ? ' active' : '')}
          data-nav
          data-key={`theme:${id}`}
          onClick={() => choose(id)}
        >
          <ThemePreview palette={id} type={id} shape={id} />
          <span class="theme-name">
            {a.theme === id && <IconCheck size={16} />} {t(`theme.${id}` as StringKey)}
          </span>
        </button>
      ))}
      <button
        role="radio"
        aria-checked={a.theme === 'custom'}
        class={'theme-option' + (a.theme === 'custom' ? ' active' : '')}
        data-nav
        data-key="theme:custom"
        onClick={() => choose('custom')}
      >
        <ThemePreview {...(a.theme === 'custom' ? a.custom : resolvedParts(a))} />
        <span class="theme-name">
          {a.theme === 'custom' && <IconCheck size={16} />} {t('theme.custom')}
        </span>
      </button>
    </div>
  );
}

function CustomMixer({ a }: { a: Appearance }) {
  const groups: { key: keyof Appearance['custom']; label: StringKey }[] = [
    { key: 'palette', label: 'settings.palette' },
    { key: 'type', label: 'settings.type' },
    { key: 'shape', label: 'settings.shape' },
  ];
  return (
    <div class="mixer">
      <p class="setting-hint">{t('settings.customHint')}</p>
      {groups.map((g) => (
        <div class="setting" key={g.key}>
          <span class="setting-label">{t(g.label)}</span>
          <div class="chips">
            {THEMES.map((id) => (
              <button
                key={id}
                class={'chip' + (a.custom[g.key] === id ? ' active' : '')}
                aria-pressed={a.custom[g.key] === id}
                data-nav
                onClick={() => setAppearance({ custom: { ...a.custom, [g.key]: id } })}
              >
                {t(`theme.${id}` as StringKey)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccentPicker({ a }: { a: Appearance }) {
  const base = THEME_ACCENT[resolvedParts(a).palette];
  return (
    <div class="setting">
      <span class="setting-label">{t('settings.accent')}</span>
      <div class="swatches">
        <button
          class={'swatch swatch-default' + (a.accent === null ? ' active' : '')}
          style={{ '--swatch': base } as any}
          aria-pressed={a.accent === null}
          aria-label={t('common.default')}
          title={t('common.default')}
          data-nav
          onClick={() => setAppearance({ accent: null })}
        />
        {ACCENT_CHOICES.map((c) => (
          <button
            key={c}
            class={'swatch' + (a.accent === c ? ' active' : '')}
            style={{ '--swatch': c } as any}
            aria-pressed={a.accent === c}
            aria-label={c}
            data-nav
            onClick={() => setAppearance({ accent: c })}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectDevice() {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');
  return (
    <form
      class="connect-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setState('busy');
        setState((await quickConnectApprove(code)) ? 'ok' : 'bad');
        setCode('');
      }}
    >
      <p class="setting-hint">{t('settings.connectHint')}</p>
      <div class="button-row">
        <input
          class="code-input"
          inputMode="numeric"
          autocomplete="one-time-code"
          data-nav
          placeholder={t('settings.code')}
          value={code}
          onInput={(e) => {
            setCode((e.target as HTMLInputElement).value);
            setState('idle');
          }}
          aria-label={t('settings.code')}
        />
        <button type="submit" class="btn btn-secondary" data-nav disabled={state === 'busy' || !code.trim()}>
          {t('settings.approve')}
        </button>
      </div>
      {state === 'ok' && <p class="setting-hint ok">{t('settings.approved')}</p>}
      {state === 'bad' && <p class="form-error">{t('settings.codeInvalid')}</p>}
    </form>
  );
}

export function Settings() {
  const a = appearance.value;
  const s = session.value;
  const langOptions: { value: LangPref; label: string }[] = [
    { value: 'auto', label: t('settings.language.auto') },
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
  ];
  void lang.value;

  return (
    <main class="page settings">
      <h1 class="page-title">{t('settings.title')}</h1>

      <Section title={t('settings.appearance')}>
        <ThemeGrid a={a} />
        {a.theme === 'custom' && <CustomMixer a={a} />}
        <AccentPicker a={a} />
        <Segmented
          label={t('settings.motion')}
          value={a.motion}
          disabled={isTV}
          options={[
            { value: 'juicy', label: t('settings.motion.juicy') },
            { value: 'subtle', label: t('settings.motion.subtle') },
            { value: 'off', label: t('settings.motion.off') },
          ]}
          onChange={(motion) => setAppearance({ motion })}
        />
        {isTV && <p class="setting-hint">{t('settings.motionTv')}</p>}
        <Segmented
          label={t('settings.cards')}
          value={a.cards}
          options={[
            { value: 'landscape', label: t('settings.cards.landscape') },
            { value: 'poster', label: t('settings.cards.poster') },
          ]}
          onChange={(cards) => setAppearance({ cards })}
        />
        <Segmented
          label={t('settings.size')}
          value={a.size}
          options={[
            { value: 's', label: t('settings.size.s') },
            { value: 'm', label: t('settings.size.m') },
            { value: 'l', label: t('settings.size.l') },
          ]}
          onChange={(size) => setAppearance({ size })}
        />
        <Segmented
          label={t('settings.scope')}
          value={scope.value}
          options={[
            { value: 'profile', label: t('settings.scope.profile') },
            { value: 'device', label: t('settings.scope.device') },
          ]}
          onChange={setScope}
        />
        <div class="setting">
          <span class="setting-label" />
          <button class="btn btn-ghost" data-nav onClick={resetAppearance}>
            {t('settings.reset')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.language')}>
        <Segmented label={t('settings.language')} value={langPref.value} options={langOptions} onChange={(v) => (langPref.value = v)} />
      </Section>

      <Section title={t('settings.account')}>
        {s && <p class="setting-hint">{t('settings.signedInAs', { name: s.userName })}</p>}
        <div class="button-row">
          <button
            class="btn btn-secondary"
            data-nav
            onClick={() => {
              leaveProfile();
              clearCatalog();
              navigate('/', { replace: true });
            }}
          >
            {t('profiles.switch')}
          </button>
          <button
            class="btn btn-ghost"
            data-nav
            onClick={async () => {
              await signOut();
              clearCatalog();
              navigate('/', { replace: true });
            }}
          >
            {t('profiles.signOut')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.connect')}>
        <ConnectDevice />
      </Section>

      <Section title={t('settings.server')}>
        <p class="setting-hint mono">{serverUrl.value}</p>
        <div class="button-row">
          <button
            class="btn btn-ghost"
            data-nav
            onClick={() => {
              clearCatalog();
              serverUrl.value = null;
              session.value = null;
              navigate('/', { replace: true });
            }}
          >
            {t('settings.changeServer')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.about')}>
        <p class="setting-hint">Lantern {APP_VERSION}</p>
      </Section>
    </main>
  );
}
