<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

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

const code = useQrCode()
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
