/**
 * CareVault design tokens.
 *
 * Direction: a record you'd trust with your mother's cardiology file, read on a
 * cheap Android in Lagos sunlight. High contrast, generous tap targets, no
 * decorative chrome. Colour carries one job only — the confidence state of a record.
 */

export const color = {
  ink: '#0E1C1B',        // primary text, splash
  leaf: '#0F6E5C',       // primary action — health without hospital-blue
  leafSoft: '#E3F0EC',   // leaf tint for fills
  paper: '#F7F6F2',      // app background
  surface: '#FFFFFF',
  slate: '#5C6B68',      // secondary text
  hairline: '#DEDDD6',
  marigold: '#E8A317',   // "needs your review" — the AI was unsure
  marigoldSoft: '#FCF2DC',
  danger: '#A52A1A',     // failures, destructive, revoke
  dangerSoft: '#F8E7E4',
} as const;

export const space = (n: number) => n * 4;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const type = {
  display:  { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.6 },
  title:    { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  body:     { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  small:    { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
} as const;

/** Minimum touch target. Non-negotiable — users include elderly dependents. */
export const HIT = 48;
