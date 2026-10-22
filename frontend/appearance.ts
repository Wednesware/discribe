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
  family?: 'mixed';
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

// Each mode offers all theme families; preferences remain independent.
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

// Mid-tone chrome with softer grey or colored pages, distinct from the
// bright light palettes and the near-black dark palettes.
const mixedStyles: Record<string, Palette> = {
  Pewter: {
    background: '#939ca6',
    surface: '#a4adb6',
    raised: '#c2c9d0',
    paper: '#bbc3cb',
    text: '#18212b',
    muted: '#394857',
    line: '#75818e',
    accent: '#344c79',
    soft: '#a2b1c4',
    hover: '#b4bec9',
    dark: false,
    family: 'mixed',
  },
  Denim: {
    background: '#839ab3',
    surface: '#96abc0',
    raised: '#bdcfe0',
    paper: '#b2c4d7',
    text: '#142333',
    muted: '#30465d',
    line: '#657f9b',
    accent: '#304d7c',
    soft: '#98afcb',
    hover: '#a6bdd3',
    dark: false,
    family: 'mixed',
  },
  Moss: {
    background: '#8a9e91',
    surface: '#9fb2a4',
    raised: '#c5d5c8',
    paper: '#becfc0',
    text: '#192b24',
    muted: '#344d40',
    line: '#6b8475',
    accent: '#305c48',
    soft: '#a3bead',
    hover: '#b3c9b9',
    dark: false,
    family: 'mixed',
  },
  Clay: {
    background: '#ab9488',
    surface: '#bba79a',
    raised: '#decec1',
    paper: '#d4c1b4',
    text: '#30221d',
    muted: '#574037',
    line: '#8d7367',
    accent: '#774734',
    soft: '#c7aa99',
    hover: '#cdb6a7',
    dark: false,
    family: 'mixed',
  },
  Lavender: {
    background: '#9a90ae',
    surface: '#ada3bf',
    raised: '#d2c8e1',
    paper: '#c4b9d4',
    text: '#292036',
    muted: '#483b5a',
    line: '#7e708f',
    accent: '#634775',
    soft: '#b6a3c9',
    hover: '#c0b0d1',
    dark: false,
    family: 'mixed',
  },
};
Object.assign(codeStyles, mixedStyles);
Object.assign(writeStyles, mixedStyles);

export function themeGroups(styles: Record<string, Palette>) {
  return {
    'Dark themes': Object.keys(styles).filter((name) => styles[name].dark && !styles[name].family),
    'Mixed themes': Object.keys(styles).filter((name) => styles[name].family === 'mixed'),
    'Light themes': Object.keys(styles).filter((name) => !styles[name].dark && !styles[name].family),
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
  document.body.dataset.themeFamily = palette.family || (palette.dark ? 'dark' : 'light');
  const pattern = `radial-gradient(ellipse at 14% 12%, ${palette.accent}${palette.dark ? '19' : '1a'}, transparent 44%), radial-gradient(ellipse at 85% 72%, ${palette.dark ? '#b39ce61a' : '#8d9dc51a'}, transparent 46%)`;
  document.body.style.setProperty('--ambient-pattern', pattern);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.surface);
}
