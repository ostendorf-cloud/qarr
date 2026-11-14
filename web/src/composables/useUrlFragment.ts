// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Keeps the page URL's fragment in step with the configuration, in both
 * directions.
 *
 * On creation it restores text and style from whatever fragment the page
 * was opened with, so a shared link reproduces the style it was copied
 * from. From then on it keeps the fragment current as either one changes,
 * so the address bar always holds a link to what the page shows right now,
 * with no separate "copy link" step to remember.
 *
 * The address bar is updated with `history.replaceState`, never by
 * assigning `location.hash` and never with `pushState`: both of those add a
 * new entry to the browser's history, which would turn every keystroke into
 * something a "back" press has to undo one at a time. `replaceState` never
 * adds an entry, however often it runs. The debounce on top of it exists
 * only to stop a fast typist from asking the browser to rewrite the address
 * bar on every keystroke; it changes nothing about whether history grows.
 */

import { onScopeDispose, ref, watch, type Ref } from 'vue'

import { decodeFragment, encodeFragment, fragmentLength } from '../url/fragment'
import type { Style } from '../qr/style'

/** How long to wait, after the last change, before the address bar catches up. */
const SYNC_DELAY_MS = 400

export interface UrlFragmentState {
  /** The length of the fragment the current text and style encode to. */
  length: Ref<number>
}

export function useUrlFragment(text: Ref<string>, style: Ref<Style>): UrlFragmentState {
  const restored = decodeFragment(currentFragment())
  if (restored) {
    text.value = restored.text
    style.value = restored.style
  }

  const length = ref(fragmentLength(text.value, style.value))
  let timer: ReturnType<typeof setTimeout> | undefined

  function sync(): void {
    const fragment = encodeFragment(text.value, style.value)
    length.value = fragment.length
    const target = fragment
      ? `${window.location.pathname}${window.location.search}#${fragment}`
      : `${window.location.pathname}${window.location.search}`
    history.replaceState(null, '', target)
  }

  watch(
    [text, style],
    () => {
      clearTimeout(timer)
      timer = setTimeout(sync, SYNC_DELAY_MS)
    },
    { deep: true },
  )

  onScopeDispose(() => clearTimeout(timer))

  return { length }
}

function currentFragment(): string {
  return window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
}
