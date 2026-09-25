import colors from 'tailwindcss/colors';

/*
 * Minimal palette.
 * - One accent (a muted violet). Every purple/violet/indigo/fuchsia/brand class
 *   resolves to it, so legacy gradients collapse into a single calm hue.
 * - Semantic hues (green, amber, red, blue...) keep their meaning but lose
 *   ~30% saturation so status color reads as information, not decoration.
 * - Hardcoded navy hexes in pages were swapped for background/surface tokens.
 */
const accent = {
  50: '#f3f2fa',
  100: '#e7e5f5',
  200: '#d0cced',
  300: '#b3acdf',
  400: '#958bd0',
  500: '#7468bd',
  600: '#62579f',
  700: '#514883',
  800: '#423b6a',
  900: '#363156',
  950: '#211e35',
};

const hexToHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};

const hslToHex = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

const mute = (scale, factor = 0.7) =>
  Object.fromEntries(
    Object.entries(scale).map(([step, hex]) => {
      const [h, s, l] = hexToHsl(hex);
      return [step, hslToHex(h, s * factor, l)];
    })
  );

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0b0c0f',
        surface: {
          DEFAULT: '#111216',
          card: '#131418',
          hover: '#16171b',
          border: 'rgba(255, 255, 255, 0.07)',
          borderHover: 'rgba(255, 255, 255, 0.13)',
        },
        accent,
        brand: accent,
        purple: accent,
        violet: accent,
        indigo: accent,
        fuchsia: accent,
        lavender: {
          300: accent[300],
          400: accent[400],
          500: accent[500],
        },
        // Slate is the app's gray; strip most of its blue so dark surfaces read
        // as neutral charcoal instead of navy.
        slate: mute(colors.slate, 0.3),
        red: mute(colors.red),
        rose: mute(colors.rose),
        pink: mute(colors.pink, 0.55),
        orange: mute(colors.orange),
        amber: mute(colors.amber),
        yellow: mute(colors.yellow),
        lime: mute(colors.lime),
        green: mute(colors.green),
        emerald: mute(colors.emerald),
        teal: mute(colors.teal),
        cyan: mute(colors.cyan, 0.6),
        sky: mute(colors.sky, 0.6),
        blue: mute(colors.blue, 0.65),
        dark: {
          800: '#17181d',
          850: '#131418',
          900: '#0f1013',
          950: '#0b0c0f',
        }
      },
      fontFamily: {
        sans: ['Satoshi', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Quieter weights: the UI leaned on bold/extrabold for everything.
      // Satoshi ships 400/500/700, so semibold drops to medium and the heavy
      // weights cap at bold.
      fontWeight: {
        semibold: '500',
        bold: '700',
        extrabold: '700',
        black: '700',
      },
      // Crisper corners; nothing blob-shaped.
      borderRadius: {
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '0.875rem',
      },
      // Elevation only where something actually floats (menus, modals).
      // Colored halos (shadow-purple-500/25 etc.) fade to near nothing.
      boxShadow: {
        sm: '0 1px 1px rgba(0, 0, 0, 0.25)',
        DEFAULT: '0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 1px 2px rgba(0, 0, 0, 0.3)',
        lg: '0 2px 4px rgba(0, 0, 0, 0.3)',
        xl: '0 12px 32px -12px rgba(0, 0, 0, 0.6)',
        '2xl': '0 16px 40px -12px rgba(0, 0, 0, 0.65)',
      },
      backdropBlur: {
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
      },
      // Status dots breathe instead of flashing.
      animation: {
        pulse: 'pulse 2.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        ping: 'pulse 2.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
}
