// PostCSS plugin: color-mix() needs Chrome 111 or Safari 16.2, and the build targets go back to
// Chrome 87 (TVs) and Safari 15.
//
// Every color-mix() here mixes a custom property, and a declaration that contains var() is only
// found invalid at computed-value time, so a plain fallback declaration in front of it would
// never be used. Instead, each of these declarations is moved into an @supports block and an
// equivalent built from channel variables takes its place:
//
//   color-mix(in srgb, var(--accent) 60%, transparent)  ->  rgba(var(--accent-rgb), 0.6)
//
// Channel variables are derived here for the palettes and set at run time next to the colours
// they mirror (custom accent, ambient colour).

const SUPPORTS = '(color: color-mix(in srgb, red, blue))';

/** Mixed variable -> [colour function, channel variable]. */
const CHANNELS = {
  '--accent': ['rgba', '--accent-rgb'],
  '--accent-2': ['rgba', '--accent-2-rgb'],
  '--ambient-c': ['hsla', '--ambient-hsl'],
};

const TO_TRANSPARENT = /color-mix\(\s*in srgb,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*transparent\s*\)/g;
// A tint over another colour cannot be rebuilt from channels: the other colour is kept alone.
const TO_COLOR = /color-mix\(\s*in srgb,\s*var\(--[\w-]+\)\s+[\d.]+%,\s*((?:[^()]|\([^()]*\))+?)\s*\)/g;

export function withoutColorMix(value) {
  return value
    .replace(TO_TRANSPARENT, (all, name, pct) => {
      const channel = CHANNELS[name];
      return channel ? `${channel[0]}(var(${channel[1]}), ${pct / 100})` : all;
    })
    .replace(TO_COLOR, '$1');
}

export default function colorMixFallback() {
  return {
    postcssPlugin: 'lantern-color-mix-fallback',
    Once(root, { AtRule }) {
      const mixed = [];
      root.walkDecls((decl) => {
        const channel = CHANNELS[decl.prop];
        const hex = /^#([0-9a-f]{6})$/i.exec(decl.value);
        if (channel && hex) {
          const rgb = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).join(', ');
          decl.cloneAfter({ prop: channel[1], value: rgb });
        }
        if (decl.value.includes('color-mix(')) mixed.push(decl);
      });
      for (const decl of mixed) {
        const fallback = withoutColorMix(decl.value);
        if (fallback.includes('color-mix(')) throw decl.error('No fallback for this color-mix(): extend scripts/color-mix-fallback.mjs');
        const rule = decl.parent;
        const modern = rule.clone({ nodes: [] });
        modern.append(decl.clone());
        rule.after(new AtRule({ name: 'supports', params: SUPPORTS, nodes: [modern] }));
        decl.value = fallback;
      }
    },
  };
}
