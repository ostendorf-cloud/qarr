// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// The two seed colours qarr's theme is derived from. Swap a value here, then
// run `THEME_WRITE=1 pnpm test src/theme/qarr.generated.test.ts` to rewrite
// qarr.css. The test fails on any drift between these seeds and that file.
export const SEEDS = {
  name: 'qarr',
  seeds: {
    // Cool slate: donates hue and chroma to backgrounds, borders and text.
    neutral: '#64748b',
    // Clear blue: donates hue and chroma to the accent and the focus ring.
    accent: '#2563eb',
  },
}
