import { appearance } from '../state/settings';
import { route } from '../router';
import { isTV } from '../platform';

/**
 * Fixed background layers behind the content: the ambient glow (artwork color) and, on a
 * computer, each style's own animated backdrop (Eva hex grid, Neon floor, P5 slashes…).
 * The look of each layer lives in fx.css, keyed on the palette.
 */
export function Decor() {
  const a = appearance.value;
  if (route.value.parts[0] === 'play') return null;
  const animated = !isTV && a.motion !== 'off';
  return (
    <div class="decor" aria-hidden="true">
      {a.ambient && <div class="ambient-glow" />}
      {!isTV && (
        <div class={'decor-layers' + (animated ? ' animated' : '')}>
          <div class="decor-a" />
          <div class="decor-b" />
        </div>
      )}
    </div>
  );
}
