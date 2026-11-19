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

    <GovueCard id="privacy" title="Privacy" as="section">
      <p class="text-base text-text">
        What you type into a code is not sent to the server. The page encodes it in the part of the
        address after the #, which a browser never sends. It stays in your browser, including its
        history, and it is only as private as wherever you paste the address.
      </p>
      <p class="mt-3 text-base text-text">
        The server counts visits only if its operator has switched that on. If so, it reports one
        page view to Umami after it served this page. Counting needs no script in your browser and
        sets no cookie. It stores nothing on your device.
      </p>
      <p class="mt-3 text-base text-text">What a counted view holds:</p>
      <ul class="mt-1 list-disc pl-6 text-base text-text">
        <li>the page, as the fixed name "/", never the address you typed or a query</li>
        <li>the site you came from, its name only and no path</li>
        <li>your browser language and your browser's user agent</li>
        <li>
          your IP address, shortened before it is sent to its first three bytes (IPv4) or six bytes
          (IPv6)
        </li>
      </ul>
      <p class="mt-3 text-base text-text">
        Umami derives country, region and city from the shortened address.
      </p>
      <p class="mt-3 text-base text-text">
        Nobody is counted who sends Do Not Track or Global Privacy Control. Prefetches, files and
        pages that failed are not counted either.
      </p>
    </GovueCard>
  </GovuePage>
  <GovueFooter note="qarr" />
</template>
