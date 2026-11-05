import { Fragment } from 'preact';

/**
 * Title text split into letters so each style can animate it in its own way (fx.css).
 * Words stay unbreakable; screen readers get the plain text.
 */
export function SplitText({ text }: { text: string }) {
  let i = 0;
  const words = text.split(' ');
  return (
    <span class="split" aria-label={text}>
      {words.map((w, wi) => (
        <Fragment key={wi}>
          <span class="word" aria-hidden="true">
            {[...w].map((ch) => (
              <span class="ch" style={{ '--ci': i++ } as any}>
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 && ' '}
        </Fragment>
      ))}
    </span>
  );
}
