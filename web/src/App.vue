<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { computed } from 'vue'
import {
  GovueCard,
  GovueFooter,
  GovueHeader,
  GovuePage,
  GovueSkipLink,
} from '@ostendorf-cloud/govue'

import QrForm from './components/QrForm.vue'
import QrPreview from './components/QrPreview.vue'
import { useQrCode } from './composables/useQrCode'
import { useUrlFragment } from './composables/useUrlFragment'
import { COMFORTABLE_FRAGMENT_LENGTH } from './url/fragment'

const code = useQrCode()
const fragment = useUrlFragment(code.text, code.style)
const fragmentTooLong = computed(() => fragment.length.value > COMFORTABLE_FRAGMENT_LENGTH)
</script>

<template>
  <GovueSkipLink />
  <GovueHeader>
    <template #brand>qarr</template>
  </GovueHeader>
  <GovuePage
    width="shell"
    title="qarr"
    lead="QR codes with your own content, colours and logo, generated in your browser."
  >
    <p class="text-base text-text">
      Nothing typed here leaves this tab: the code is drawn on a canvas in your browser, not on a
      server.
    </p>
    <p class="text-base text-text">
      This page's own address carries the text, colours and shape, so copying it shares exactly that
      part of the style; it is only as private as wherever that address is pasted. A logo you add
      stays in this browser and never travels in the link.
    </p>
    <p v-if="fragmentTooLong" role="status" class="text-sm text-warning-text">
      This address has grown long enough that pasting it may look awkward in a chat message or a
      ticket.
    </p>

    <div class="grid gap-6 lg:grid-cols-2">
      <GovueCard title="Your code" as="section">
        <QrForm v-model:text="code.text.value" v-model:qr-style="code.style.value" />
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
  </GovuePage>
  <GovueFooter note="qarr" />
</template>
