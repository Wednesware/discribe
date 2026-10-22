import type { Mode, Settings } from './model';

export interface Palette {
  background: string;
  surface: string;
  raised: string;
  paper: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  soft: string;
  hover: string;
  dark: boolean;
}

export const codeStyles: Record<string, Palette> = {
  Graphite: {
    background: '#16181f',
    surface: '#1b1e27',
    raised: '#232733',
    paper: '#20232d',
    text: '#d2d7e4',
    muted: '#929db3',
    line: '#303647',
    accent: '#b4a3e0',
    soft: '#302e45',
    hover: '#2b2f3e',
    dark: true,
  },
  Midnight: {
    background: '#101721',
    surface: '#17212e',
    raised: '#202e3e',
    paper: '#182434',
    text: '#d4e2ef',
    muted: '#93aabe',
    line: '#304256',
    accent: '#86bce4',
    soft: '#263e56',
    hover: '#26384c',
    dark: true,
  },
  Slate: {
    background: '#242a30',
    surface: '#2b333b',
    raised: '#35414a',
    paper: '#303941',
    text: '#e0e7e9',
    muted: '#a3b4bb',
    line: '#45535d',
    accent: '#9ac7bf',
    soft: '#354c4b',
    hover: '#3a4850',
    dark: true,
  },
};

export const writeStyles: Record<string, Palette> = {
  'Grey blue': {
    background: '#bfcbd9',
    surface: '#cbd5e1',
    raised: '#dbe3ed',
    paper: '#d1dbe6',
    text: '#30445e',
    muted: '#536a83',
    line: '#a9bacd',
    accent: '#526e9c',
    soft: '#b8c8df',
    hover: '#bccbde',
    dark: false,
  },
  Mist: {
    background: '#d6dfe8',
    surface: '#dfe6ee',
    raised: '#e9eef4',
    paper: '#e1e8f0',
    text: '#35465c',
    muted: '#5e7289',
    line: '#bdcbd9',
    accent: '#647fa3',
    soft: '#c9d7e8',
    hover: '#cfdae7',
    dark: false,
  },
  Sage: {
    background: '#c4d2cf',
    surface: '#cfdcd6',
    raised: '#dfe8e1',
    paper: '#d5e1da',
    text: '#334e47',
    muted: '#587269',
    line: '#a6bfb3',
    accent: '#527b6b',
    soft: '#b9d0c3',
    hover: '#bed1c6',
    dark: false,
  },
};

export function paletteFor(mode: Mode, settings: Settings): Palette {
  return mode === 'code'
    ? codeStyles[settings.codeStyle] || codeStyles.Graphite
    : writeStyles[settings.writeStyle] || writeStyles['Grey blue'];
}

export function applyAppearance(mode: Mode, settings: Settings) {
  document.body.dataset.mode = mode;
  const palette = paletteFor(mode, settings);
  const values = {
    bg: palette.background,
    surface: palette.surface,
    'surface-raised': palette.raised,
    paper: palette.paper,
    text: palette.text,
    muted: palette.muted,
    line: palette.line,
    accent: palette.accent,
    'accent-soft': palette.soft,
    hover: palette.hover,
  };
  for (const [key, value] of Object.entries(values)) document.body.style.setProperty(`--${key}`, value);
  document.body.style.colorScheme = palette.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.surface);
}
