import {
  defineConfig,
  minimal2023Preset,
  type Preset,
} from '@vite-pwa/assets-generator/config';

/**
 * The generator's own defaults paint the flat backgrounds white, which puts a
 * bright card behind an icon drawn for a dark ground — visible on iOS, where
 * the apple-touch icon cannot be transparent. Both flat surfaces take the app's
 * own ground instead.
 *
 * The maskable icon needs more than a colour change. Android crops it to an
 * arbitrary shape and only guarantees the middle 80% survives, so the star's
 * six points have to sit inside that circle. The preset's default padding
 * leaves them on the edge; 0.4 pulls the artwork in far enough that a circular
 * crop clears every point.
 */
const ground = '#0b0d12';

const preset: Preset = {
  ...minimal2023Preset,
  maskable: { ...minimal2023Preset.maskable, padding: 0.4, resizeOptions: { background: ground } },
  apple: { ...minimal2023Preset.apple, resizeOptions: { background: ground } },
};

/* Generated from the plated source, not favicon.svg: the installed-app icons
   need an opaque ground, and the tab favicon needs the opposite. See the
   comment at the top of public/icon-plate.svg. */
export default defineConfig({
  preset,
  images: ['public/icon-plate.svg'],
});
