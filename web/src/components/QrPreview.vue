<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { computed, ref, useTemplateRef, watch } from 'vue'
import { GovueButton } from '@ostendorf-cloud/govue'

import { png, svg } from '../qr/export'
import { dataURL } from '../qr/logo'
import type { Result } from '../qr/render'
import type { Style } from '../qr/style'
import type { Status } from '../composables/useQrCode'

const props = defineProps<{
  status: Status
  result: Result | null
  problem: string
  adjusted: string[]
  // Named qrStyle rather than style: Vue reserves a prop literally named
  // "style" for its own class/style merging.
  qrStyle: Style
}>()

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')
const downloading = ref(false)

watch(
  () => props.result,
  (result) => {
    const canvas = canvasRef.value
    if (!canvas || !result) return
    canvas.width = result.width
    canvas.height = result.height
    const context = canvas.getContext('2d')
    context?.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0)
  },
  { immediate: true },
)

const summary = computed(() =>
  props.result ? `level ${props.result.level}, ${props.result.matrix.size} modules` : '',
)

/**
 * The decode check already ran while drawing: render() throws when nothing
 * it tries reads back, so reaching "ready" means jsQR already confirmed this
 * exact picture carries this exact text. This restates that outcome for
 * whoever is looking at the page, rather than asking them to trust it.
 */
const decodeCheck = computed(() => {
  if (props.status === 'ready') return 'This code was decoded back right after it was drawn.'
  if (props.status === 'failed') return 'This code does not read back. Nothing is shown below.'
  return ''
})

async function downloadPng(): Promise<void> {
  if (!props.result) return
  downloading.value = true
  try {
    const blob = await png(props.result)
    save(blob, 'qarr-code.png')
  } finally {
    downloading.value = false
  }
}

function downloadSvg(): void {
  if (!props.result) return
  const logoUrl = props.qrStyle.logo ? dataURL(props.qrStyle.logo) : null
  const text = svg(props.result, props.qrStyle, logoUrl)
  save(new Blob([text], { type: 'image/svg+xml' }), 'qarr-code.svg')
}

/**
 * A plain anchor click, entirely inside the tab: the blob is built from the
 * pixels already in memory, never fetched or posted anywhere.
 */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-4">
    <p v-if="status === 'empty'" class="text-base text-text-muted">
      Type something above to draw a code.
    </p>

    <p v-if="status === 'failed'" role="alert" class="text-base text-danger-text">
      {{ problem }}
    </p>

    <template v-if="status === 'ready' && result">
      <canvas ref="canvas" class="rounded-md" role="img" aria-label="The drawn code"></canvas>

      <p class="text-sm text-text-muted">{{ summary }}</p>
      <p class="text-sm text-success-text">{{ decodeCheck }}</p>

      <ul v-if="adjusted.length > 0" class="flex flex-col gap-1 text-sm text-text-muted">
        <li v-for="line in adjusted" :key="line">{{ line }}</li>
      </ul>

      <div class="flex gap-2">
        <GovueButton variant="secondary" :loading="downloading" @click="downloadPng">
          Download PNG
        </GovueButton>
        <GovueButton variant="secondary" @click="downloadSvg">Download SVG</GovueButton>
      </div>
    </template>
  </div>
</template>
