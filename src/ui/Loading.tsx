import { t } from '../i18n';

/**
 * Loading state: a skeleton of the page (hero and rows) with a shimmer in the style's
 * colors; `spinner` keeps the small spinner for screens that are not a catalog page.
 */
export function Loading({ label, spinner }: { label?: string; spinner?: boolean }) {
  const hidden = <span class="visually-hidden">{label ?? t('common.loading')}</span>;
  if (spinner)
    return (
      <div class="loading" role="status">
        <span class="spinner" />
        {hidden}
      </div>
    );
  return (
    <div class="skeleton" role="status">
      <div class="sk sk-hero" />
      {[0, 1].map((r) => (
        <div class="sk-block" key={r}>
          <div class="sk sk-title" />
          <div class="sk-row">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div class="sk sk-card" key={i} style={{ '--i': i } as any} />
            ))}
          </div>
        </div>
      ))}
      {hidden}
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
