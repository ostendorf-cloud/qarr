// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * The state of one code being made: the free text it carries, what it looks
 * like, and what came out of drawing and decoding it.
 *
 * Everything runs in the tab. The payload never leaves it, so this
 * composable owns the whole pipeline rather than calling an API with it.
 * The content is either the free text or a guided form (WiFi, a vCard, an
 * appointment, a telephone number, a SEPA transfer) serialised by
 * qr/guided. Each form keeps its own entries while another is shown.
 */

import { computed, markRaw, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'

import {
  carry,
  emptyFields,
  serialize,
  SPECS,
  type AllFields,
  type Errors,
  type Kind,
} from '../qr/guided'
import { defaultStyle, type Style } from '../qr/style'
import { render, RenderError, type Result } from '../qr/render'

/** The four states a preview can be in. */
export type Status = 'empty' | 'working' | 'ready' | 'failed'

export interface QrCodeState {
  text: Ref<string>
  /** Free text, or the guided form that builds the text. */
  kind: Ref<Kind>
  /** The fields of every guided form; a form not shown keeps what was typed. */
  fields: Ref<AllFields>
  /** What the guided form of the current kind refuses, by field. */
  errors: ComputedRef<Errors>
  /** The string the code carries: the text, or the guided form serialised. */
  content: ComputedRef<string>
  /** Set by a switch of kind that left filled fields behind. */
  notice: Ref<{ from: Kind; dropped: string[] } | null>
  switchKind: (next: Kind) => void
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
  const kind = ref<Kind>('text')
  const fields = ref<AllFields>(emptyFields())
  const notice = ref<{ from: Kind; dropped: string[] } | null>(null)

  // Serialised once, so the drawing, the errors and the content agree. The
  // appointment's creation time is read here, so it changes only when a field does.
  const outcome = computed(() =>
    kind.value === 'text' ? null : serialize(kind.value, fields.value[kind.value]),
  )
  const content = computed(() => {
    if (kind.value === 'text') return text.value
    return outcome.value?.ok ? outcome.value.payload : ''
  })
  const errors = computed<Errors>(() =>
    outcome.value && !outcome.value.ok ? outcome.value.errors : {},
  )

  function switchKind(next: Kind): void {
    const from = kind.value
    notice.value = null
    if (from !== 'text' && next !== 'text' && from !== next) {
      const moved = carry(from, next, fields.value[from], fields.value[next])
      fields.value[next] = moved.fields
      if (moved.dropped.length > 0) notice.value = { from, dropped: moved.dropped }
    } else if (from !== 'text' && next === 'text') {
      // Free text has no fields to take over what the form held.
      const filled = SPECS[from].filter(
        (s) => s.control !== 'select' && (fields.value[from][s.key] ?? '') !== '',
      )
      if (filled.length > 0) notice.value = { from, dropped: filled.map((s) => s.key) }
    } else if (from === 'text' && text.value !== '') {
      notice.value = { from, dropped: ['text'] }
    }
    kind.value = next
  }
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

    if (content.value === '') {
      // A form somebody has not typed into yet is not an error.
      status.value = 'empty'
      result.value = null
      return
    }

    status.value = 'working'
    try {
      const drawn = render(content.value, style.value)
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
  //
  // Not immediate: text and style both start empty, which is exactly the
  // state the four refs above are already created with. Running redraw at
  // creation would only reassign them to the values they already hold,
  // before a caller such as useUrlFragment gets a chance to restore a
  // shared link's own text and style.
  watch([content, style], redraw, { deep: true })

  return {
    text,
    kind,
    fields,
    errors,
    content,
    notice,
    switchKind,
    style,
    status,
    result,
    problem,
    adjusted,
    redraw,
  }
}

/** The computed label a preview shows under the code. */
export function summary(state: QrCodeState): string {
  if (state.status.value === 'ready' && state.result.value) {
    return `level ${state.result.value.level}, ${state.result.value.matrix.size} modules`
  }
  return ''
}
