import { config } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

const appConfig = createTamagui({
  ...config,
  themes: {
    light: {
      background: '#FFFFFF',
      backgroundSoft: '#F5F5F5',
      backgroundHover: '#EEEEEE',
      backgroundPress: '#E0E0E0',
      backgroundFocus: '#EEEEEE',
      backgroundStrong: '#F5F5F5',
      backgroundTransparent: 'rgba(255,255,255,0)',
      color: '#000000',
      colorHover: '#262626',
      colorPress: '#404040',
      colorFocus: '#262626',
      colorTransparent: 'rgba(0,0,0,0)',
      borderColor: '#E0E0E0',
      borderColorHover: '#BDBDBD',
      borderColorFocus: '#9E9E9E',
      borderColorPress: '#757575',
      placeholderColor: '#9E9E9E',
      outlineColor: '#000000',

      // Brand colors
      primary: '#2563EB',
      primaryHover: '#1D4ED8',
      primaryPress: '#1E40AF',
      primaryFocus: '#1D4ED8',

      secondary: '#64748B',
      secondaryHover: '#475569',
      secondaryPress: '#334155',
      secondaryFocus: '#475569',

      // Semantic colors
      success: '#10B981',
      successHover: '#059669',
      successPress: '#047857',

      warning: '#F59E0B',
      warningHover: '#D97706',
      warningPress: '#B45309',

      error: '#EF4444',
      errorHover: '#DC2626',
      errorPress: '#B91C1C',

      info: '#3B82F6',
      infoHover: '#2563EB',
      infoPress: '#1D4ED8',

      // Card background
      card: '#FFFFFF',
      cardHover: '#F9FAFB',
      cardPress: '#F3F4F6',
    },
    dark: {
      background: '#0F172A',
      backgroundSoft: '#1E293B',
      backgroundHover: '#334155',
      backgroundPress: '#475569',
      backgroundFocus: '#334155',
      backgroundStrong: '#1E293B',
      backgroundTransparent: 'rgba(15,23,42,0)',
      color: '#F8FAFC',
      colorHover: '#E2E8F0',
      colorPress: '#CBD5E1',
      colorFocus: '#E2E8F0',
      colorTransparent: 'rgba(248,250,252,0)',
      borderColor: '#334155',
      borderColorHover: '#475569',
      borderColorFocus: '#64748B',
      borderColorPress: '#94A3B8',
      placeholderColor: '#64748B',
      outlineColor: '#F8FAFC',

      // Brand colors
      primary: '#3B82F6',
      primaryHover: '#2563EB',
      primaryPress: '#1D4ED8',
      primaryFocus: '#2563EB',

      secondary: '#64748B',
      secondaryHover: '#94A3B8',
      secondaryPress: '#CBD5E1',
      secondaryFocus: '#94A3B8',

      // Semantic colors
      success: '#10B981',
      successHover: '#34D399',
      successPress: '#6EE7B7',

      warning: '#F59E0B',
      warningHover: '#FBBF24',
      warningPress: '#FCD34D',

      error: '#EF4444',
      errorHover: '#F87171',
      errorPress: '#FCA5A5',

      info: '#3B82F6',
      infoHover: '#60A5FA',
      infoPress: '#93C5FD',

      // Card background
      card: '#1E293B',
      cardHover: '#334155',
      cardPress: '#475569',
    },
  },
})

export type AppConfig = typeof appConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default appConfig
