<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { computed } from 'vue'
import {
  GovueCard,
  GovueFooter,
  GovueHeader,
  GovueLanguageSwitch,
  GovuePage,
  GovueSkipLink,
  isLocaleCode,
  legalPath,
  useLanguage,
} from '@ostendorf-cloud/govue'

import QrForm from './components/QrForm.vue'
import QrPreview from './components/QrPreview.vue'
import { useQrCode } from './composables/useQrCode'
import { guidedOf, useUrlFragment } from './composables/useUrlFragment'
import { COMFORTABLE_FRAGMENT_LENGTH, encodeFragment } from './url/fragment'

const language = useLanguage()
const privacyHref = computed(() =>
  legalPath('privacy', isLocaleCode(language.locale.value) ? language.locale.value : 'en'),
)

const code = useQrCode()
const fragment = useUrlFragment(code.text, code.style, code)
const fragmentTooLong = computed(() => fragment.length.value > COMFORTABLE_FRAGMENT_LENGTH)

// Every language is its own prerendered page, so a language change goes to
// the start page of that language. The fragment is the state of the page, so
// it travels along. It is encoded from the current text and style rather than
// read from the address bar, which lags the last keystroke by the debounce.
function onLanguageChange(next: string): void {
  const encoded = encodeFragment(code.text.value, code.style.value, guidedOf(code))
  window.location.assign(`/${next}/${encoded ? `#${encoded}` : ''}`)
}
</script>

<template>
  <GovueSkipLink />
  <GovueHeader>
    <template #brand>qarr</template>
    <template #actions>
      <GovueLanguageSwitch @change="onLanguageChange" />
    </template>
  </GovueHeader>
  <!-- The page text of qarr itself is English only for now. The header and
       the footer follow the language of the address. -->
  <GovuePage
    lang="en"
    width="shell"
    title="qarr"
    lead="QR codes with your own content, colours and logo, generated in your browser."
  >
    <p class="text-base text-text">
      Nothing typed here leaves this tab: the code is drawn on a canvas in your browser, not on a
      server.
    </p>
    <p class="text-base text-text">
      This page's own address carries the text, colours and shape, and what you enter in a guided
      form, so copying it shares exactly that part of the style; it is only as private as wherever
      that address is pasted. A logo you add stays in this browser and never travels in the link.
    </p>
    <p v-if="fragmentTooLong" role="status" class="text-sm text-warning-text">
      This address has grown long enough that pasting it may look awkward in a chat message or a
      ticket.
    </p>

    <div class="grid gap-6 lg:grid-cols-2">
      <GovueCard title="Your code" as="section">
        <QrForm
          v-model:text="code.text.value"
          v-model:kind="code.kind.value"
          v-model:fields="code.fields.value"
          v-model:qr-style="code.style.value"
          :errors="code.errors.value"
          :notice="code.notice.value"
          @switch-kind="code.switchKind"
        />
      </GovueCard>

      <GovueCard title="Preview" as="section">
        <QrPreview
          :status="code.status.value"
          :result="code.result.value"
          :problem="code.problem.value"
          :adjusted="code.adjusted.value"
          :qr-style="code.style.value"
        />
      </GovueCard>
    </div>

    <p class="text-base text-text">
      What this site does with your data, including the counting of page views, is in the
      <a :href="privacyHref" class="text-accent-text hover:underline">privacy statement</a>.
    </p>
  </GovuePage>
  <GovueFooter :legal="['imprint', 'privacy']" note="qarr" />
</template>
