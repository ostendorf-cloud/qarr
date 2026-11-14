<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { GovueFooter, GovueHeader, GovuePage, GovueSkipLink } from '@ostendorf-cloud/govue'
</script>

<template>
  <GovueSkipLink />
  <GovueHeader>
    <template #brand>qarr</template>
  </GovueHeader>
  <GovuePage
    title="qarr"
    lead="QR codes with your own content, colours and logo, generated in your browser."
  >
    <p class="text-base text-text">
      Nothing typed here leaves this tab: the code is drawn on a canvas in your browser, not on a
      server.
    </p>
  </GovuePage>
  <GovueFooter note="qarr" />
</template>
