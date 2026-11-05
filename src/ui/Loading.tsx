import { t } from '../i18n';

export function Loading({ label }: { label?: string }) {
  return (
    <div class="loading" role="status">
      <span class="spinner" />
      <span class="visually-hidden">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Message({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  return (
    <div class="message">
      <p>{text}</p>
      {action && (
        <button class="btn btn-secondary" data-nav data-nav-autofocus onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
