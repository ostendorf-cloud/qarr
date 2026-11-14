// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The state of one code being made: the free text it carries, what it looks
 * like, and what came out of drawing and decoding it.
 *
 * Everything runs in the tab. The payload never leaves it, so this
 * composable owns the whole pipeline rather than calling an API with it.
 * Guided payload kinds (WiFi, a vCard, and the rest) are a later issue; this
 * is free text only.
 */

import { markRaw, ref, shallowRef, watch, type Ref } from 'vue'

import { defaultStyle, type Style } from '../qr/style'
import { render, RenderError, type Result } from '../qr/render'

/** The four states a preview can be in. */
export type Status = 'empty' | 'working' | 'ready' | 'failed'

export interface QrCodeState {
  text: Ref<string>
  style: Ref<Style>
  status: Ref<Status>
  result: Ref<Result | null>
  /** What went wrong, in words a person can act on. */
  problem: Ref<string>
  /** What the repair changed, empty when the wish was met as it was. */
  adjusted: Ref<string[]>
  /** Redraw now, for a change a watcher cannot see, such as a new logo. */
  redraw: () => void
}

export function useQrCode(): QrCodeState {
  const text = ref('')
  const style = ref<Style>(defaultStyle())
  const status = ref<Status>('empty')
  // Shallow on purpose, twice over: the result is replaced whole and never
  // edited, and making it deeply reactive would both strip the Matrix of
  // its methods and walk a quarter million pixel values on every keystroke.
  const result = shallowRef<Result | null>(null)
  const problem = ref('')
  const adjusted = ref<string[]>([])

  function redraw(): void {
    problem.value = ''
    adjusted.value = []

    if (text.value === '') {
      // A form somebody has not typed into yet is not an error.
      status.value = 'empty'
      result.value = null
      return
    }

    status.value = 'working'
    try {
      const drawn = render(text.value, style.value)
      result.value = markRaw(drawn)
      adjusted.value = drawn.adjusted
      status.value = 'ready'
    } catch (caught) {
      result.value = null
      status.value = 'failed'
      problem.value =
        caught instanceof RenderError ? caught.message : 'the code could not be drawn here'
    }
  }

  // Deep, because the form writes into the style in place. The logo is
  // marked raw where it is made, so this traversal stops at it rather than
  // walking its pixels; the logo picker calls redraw directly after setting it.
  watch([text, style], redraw, { deep: true, immediate: true })

  return { text, style, status, result, problem, adjusted, redraw }
}

/** The computed label a preview shows under the code. */
export function summary(state: QrCodeState): string {
  if (state.status.value === 'ready' && state.result.value) {
    return `level ${state.result.value.level}, ${state.result.value.matrix.size} modules`
  }
  return ''
}
