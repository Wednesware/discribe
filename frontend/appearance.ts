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
    background: '#182330',
    surface: '#202e3e',
    raised: '#304258',
    paper: '#27374a',
    text: '#dce6f4',
    muted: '#a4b7cd',
    line: '#40566d',
    accent: '#91b6df',
    soft: '#35465f',
    hover: '#374b64',
    dark: true,
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

// Each mode offers both families; mode preferences remain independent.
const nebula: Palette = {
  background: '#211e32',
  surface: '#2b2940',
  raised: '#3b3656',
  paper: '#322e49',
  text: '#eee4f6',
  muted: '#b6aaca',
  line: '#514869',
  accent: '#ccabeb',
  soft: '#453956',
  hover: '#453f60',
  dark: true,
};
const aurora: Palette = {
  background: '#152b2e',
  surface: '#1e383c',
  raised: '#2b4a4e',
  paper: '#244145',
  text: '#dbefeb',
  muted: '#a1c5bd',
  line: '#3b6060',
  accent: '#89d0c4',
  soft: '#305354',
  hover: '#35575b',
  dark: true,
};
Object.assign(codeStyles, { Nebula: nebula, Aurora: aurora, Mist: writeStyles.Mist, Sage: writeStyles.Sage });
Object.assign(writeStyles, {
  Graphite: codeStyles.Graphite,
  Midnight: codeStyles.Midnight,
  Nebula: nebula,
  Aurora: aurora,
});

export function themeGroups(styles: Record<string, Palette>) {
  return {
    'Dark themes': Object.keys(styles).filter((name) => styles[name].dark),
    'Light themes': Object.keys(styles).filter((name) => !styles[name].dark),
  };
}

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
  document.body.dataset.theme = mode === 'code' ? settings.codeStyle : settings.writeStyle;
  document.body.dataset.scheme = palette.dark ? 'dark' : 'light';
  const pattern = `radial-gradient(ellipse at 14% 12%, ${palette.accent}${palette.dark ? '19' : '1a'}, transparent 44%), radial-gradient(ellipse at 85% 72%, ${palette.dark ? '#b39ce61a' : '#8d9dc51a'}, transparent 46%)`;
  document.body.style.setProperty('--ambient-pattern', pattern);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.surface);
}
