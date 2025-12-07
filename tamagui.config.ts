import { createTamagui, createTokens, createTheme } from '@tamagui/core'
import { shorthands } from '@tamagui/shorthands'
import { createMedia } from '@tamagui/react-native-media-driver'

// Custom tokens with 4px base spacing scale
const tokens = createTokens({
  color: {
    // Primary - Blue for focus and intelligence
    primary50: '#EFF6FF',
    primary100: '#DBEAFE',
    primary200: '#BFDBFE',
    primary300: '#93C5FD',
    primary400: '#60A5FA',
    primary500: '#3B82F6', // Main primary
    primary600: '#2563EB',
    primary700: '#1D4ED8',
    primary800: '#1E40AF',
    primary900: '#1E3A8A',

    // Accent - Teal/Green for success and growth
    accent50: '#ECFDF5',
    accent100: '#D1FAE5',
    accent200: '#A7F3D0',
    accent300: '#6EE7B7',
    accent400: '#34D399',
    accent500: '#10B981', // Main accent
    accent600: '#059669',
    accent700: '#047857',
    accent800: '#065F46',
    accent900: '#064E3B',

    // Neutral grays
    gray50: '#F9FAFB',
    gray100: '#F3F4F6',
    gray200: '#E5E7EB',
    gray300: '#D1D5DB',
    gray400: '#9CA3AF',
    gray500: '#6B7280',
    gray600: '#4B5563',
    gray700: '#374151',
    gray800: '#1F2937',
    gray900: '#111827',
    gray950: '#030712',

    // Warning - Amber/Yellow
    warning50: '#FFFBEB',
    warning100: '#FEF3C7',
    warning200: '#FDE68A',
    warning300: '#FCD34D',
    warning400: '#FBBF24',
    warning500: '#F59E0B',
    warning600: '#D97706',
    warning700: '#B45309',
    warning800: '#92400E',
    warning900: '#78350F',

    // Error - Red (minimal use to avoid Anki association)
    error50: '#FEF2F2',
    error100: '#FEE2E2',
    error200: '#FECACA',
    error300: '#FCA5A5',
    error400: '#F87171',
    error500: '#EF4444',
    error600: '#DC2626',
    error700: '#B91C1C',
    error800: '#991B1B',
    error900: '#7F1D1D',

    // Base colors
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'rgba(0,0,0,0)',
  },
  // 4px base spacing scale
  space: {
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    3.5: 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    11: 44,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,
    28: 112,
    32: 128,
    true: 16, // Default spacing
  },
  size: {
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    3.5: 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    11: 44,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,
    true: 44, // Default touch target
  },
  radius: {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
    6: 12,
    7: 14,
    8: 16,
    9: 20,
    10: 24,
    true: 8, // Default radius
    round: 9999,
  },
  zIndex: {
    0: 0,
    1: 100,
    2: 200,
    3: 300,
    4: 400,
    5: 500,
  },
})

// Light theme - clean, bright interface
const lightTheme = createTheme({
  // Background colors
  background: tokens.color.gray50,
  backgroundHover: tokens.color.gray100,
  backgroundPress: tokens.color.gray200,
  backgroundFocus: tokens.color.primary50,
  backgroundStrong: tokens.color.white,
  backgroundTransparent: tokens.color.transparent,

  // Surface colors (for cards, panels)
  surface: tokens.color.white,
  surfaceHover: tokens.color.gray50,
  surfacePress: tokens.color.gray100,
  surfaceBorder: tokens.color.gray200,

  // Primary colors - blue
  primary: tokens.color.primary500,
  primaryHover: tokens.color.primary600,
  primaryPress: tokens.color.primary700,
  primaryFocus: tokens.color.primary400,
  primaryLight: tokens.color.primary100,
  primaryDark: tokens.color.primary800,

  // Accent colors - teal/green
  accent: tokens.color.accent500,
  accentHover: tokens.color.accent600,
  accentPress: tokens.color.accent700,
  accentLight: tokens.color.accent100,

  // Text colors
  color: tokens.color.gray900,
  colorHover: tokens.color.gray950,
  colorPress: tokens.color.black,
  colorFocus: tokens.color.gray900,
  colorTransparent: tokens.color.transparent,
  colorMuted: tokens.color.gray600,
  colorSubtle: tokens.color.gray500,
  colorDisabled: tokens.color.gray400,

  // Border colors
  borderColor: tokens.color.gray200,
  borderColorHover: tokens.color.gray300,
  borderColorFocus: tokens.color.primary500,
  borderColorPress: tokens.color.primary600,

  // Semantic colors
  success: tokens.color.accent500,
  successBackground: tokens.color.accent50,
  successBorder: tokens.color.accent200,

  warning: tokens.color.warning500,
  warningBackground: tokens.color.warning50,
  warningBorder: tokens.color.warning200,

  error: tokens.color.error500,
  errorBackground: tokens.color.error50,
  errorBorder: tokens.color.error200,

  // Shadow colors
  shadowColor: tokens.color.gray900,
  shadowColorHover: tokens.color.gray950,
  shadowColorPress: tokens.color.black,
  shadowColorFocus: tokens.color.primary500,

  // Component-specific
  placeholderColor: tokens.color.gray400,
})

// Dark theme - sophisticated, easy on eyes
const darkTheme = createTheme({
  // Background colors
  background: tokens.color.gray950,
  backgroundHover: tokens.color.gray900,
  backgroundPress: tokens.color.gray800,
  backgroundFocus: tokens.color.primary900,
  backgroundStrong: tokens.color.gray900,
  backgroundTransparent: tokens.color.transparent,

  // Surface colors (for cards, panels)
  surface: tokens.color.gray900,
  surfaceHover: tokens.color.gray800,
  surfacePress: tokens.color.gray700,
  surfaceBorder: tokens.color.gray800,

  // Primary colors - lighter blue for dark bg
  primary: tokens.color.primary400,
  primaryHover: tokens.color.primary300,
  primaryPress: tokens.color.primary200,
  primaryFocus: tokens.color.primary500,
  primaryLight: tokens.color.primary900,
  primaryDark: tokens.color.primary200,

  // Accent colors - lighter teal/green for dark bg
  accent: tokens.color.accent400,
  accentHover: tokens.color.accent300,
  accentPress: tokens.color.accent200,
  accentLight: tokens.color.accent900,

  // Text colors
  color: tokens.color.gray100,
  colorHover: tokens.color.gray50,
  colorPress: tokens.color.white,
  colorFocus: tokens.color.gray100,
  colorTransparent: tokens.color.transparent,
  colorMuted: tokens.color.gray400,
  colorSubtle: tokens.color.gray500,
  colorDisabled: tokens.color.gray600,

  // Border colors
  borderColor: tokens.color.gray800,
  borderColorHover: tokens.color.gray700,
  borderColorFocus: tokens.color.primary400,
  borderColorPress: tokens.color.primary300,

  // Semantic colors
  success: tokens.color.accent400,
  successBackground: tokens.color.accent900,
  successBorder: tokens.color.accent800,

  warning: tokens.color.warning400,
  warningBackground: tokens.color.warning900,
  warningBorder: tokens.color.warning800,

  error: tokens.color.error400,
  errorBackground: tokens.color.error900,
  errorBorder: tokens.color.error800,

  // Shadow colors
  shadowColor: tokens.color.black,
  shadowColorHover: tokens.color.black,
  shadowColorPress: tokens.color.black,
  shadowColorFocus: tokens.color.primary900,

  // Component-specific
  placeholderColor: tokens.color.gray600,
})

// Component-specific themes
const componentThemes = {
  // Card component
  Card: createTheme({
    background: lightTheme.surface,
    borderColor: lightTheme.surfaceBorder,
    shadowColor: lightTheme.shadowColor,
  }),
  Card_dark: createTheme({
    background: darkTheme.surface,
    borderColor: darkTheme.surfaceBorder,
    shadowColor: darkTheme.shadowColor,
  }),

  // Button component
  Button: createTheme({
    background: lightTheme.primary,
    backgroundHover: lightTheme.primaryHover,
    backgroundPress: lightTheme.primaryPress,
    color: tokens.color.white,
  }),
  Button_dark: createTheme({
    background: darkTheme.primary,
    backgroundHover: darkTheme.primaryHover,
    backgroundPress: darkTheme.primaryPress,
    color: tokens.color.gray900,
  }),

  // Input component
  Input: createTheme({
    background: lightTheme.surface,
    borderColor: lightTheme.borderColor,
    borderColorFocus: lightTheme.borderColorFocus,
    color: lightTheme.color,
    placeholderColor: lightTheme.placeholderColor,
  }),
  Input_dark: createTheme({
    background: darkTheme.surface,
    borderColor: darkTheme.borderColor,
    borderColorFocus: darkTheme.borderColorFocus,
    color: darkTheme.color,
    placeholderColor: darkTheme.placeholderColor,
  }),
}

// Media queries for responsive design
const media = createMedia({
  xs: { maxWidth: 660 },
  sm: { maxWidth: 800 },
  md: { maxWidth: 1020 },
  lg: { maxWidth: 1280 },
  xl: { maxWidth: 1420 },
  xxl: { maxWidth: 1600 },
  gtXs: { minWidth: 660 + 1 },
  gtSm: { minWidth: 800 + 1 },
  gtMd: { minWidth: 1020 + 1 },
  gtLg: { minWidth: 1280 + 1 },
  short: { maxHeight: 820 },
  tall: { minHeight: 820 },
  hoverNone: { hover: 'none' },
  pointerCoarse: { pointer: 'coarse' },
})

// Create the Tamagui config
const config = createTamagui({
  tokens,
  themes: {
    light: lightTheme,
    dark: darkTheme,
    ...componentThemes,
  },
  media,
  shorthands,
  shouldAddPrefersColorThemes: true,
  themeClassNameOnRoot: true,
})

export type AppConfig = typeof config

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config
