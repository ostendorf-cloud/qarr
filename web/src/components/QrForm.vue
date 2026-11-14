<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { computed, ref, useId, useTemplateRef } from 'vue'
import {
  GovueButton,
  GovueCheckbox,
  GovueField,
  GovueSelect,
  GovueTextarea,
} from '@ostendorf-cloud/govue'

import { fromFile, ImageError, MAX_LOGO_BYTES } from '../qr/logo'
import type { Style } from '../qr/style'

const text = defineModel<string>('text', { default: '' })
// Named qrStyle rather than style: Vue reserves a prop literally named
// "style" for its own class/style merging, which would stop this from
// arriving as a normal, readable value.
const style = defineModel<Style>('qrStyle', { required: true })

/**
 * Every change below replaces the whole style rather than mutating a field
 * of the one the parent passed in: a model only tells its parent about a
 * change when its value is actually reassigned.
 */
function patch(fields: Partial<Style>): void {
  style.value = { ...style.value, ...fields }
}

const shapeOptions = [
  { value: 'square', label: 'Square modules' },
  { value: 'round', label: 'Round modules' },
]

const shape = computed({
  get: () => style.value.shape,
  set: (value) => patch({ shape: value === 'round' ? 'round' : 'square' }),
})

const foreground = computed({
  get: () => style.value.foreground,
  set: (value) => patch({ foreground: value }),
})

const background = computed({
  get: () => style.value.background,
  set: (value) => patch({ background: value }),
})

const transparentBackground = computed({
  get: () => style.value.background === '',
  set: (on) => patch({ background: on ? '' : '#ffffff' }),
})

const hasLogo = computed(() => style.value.logo !== null)
const logoError = ref('')
const choosingLogo = ref(false)
const logoInput = useTemplateRef<HTMLInputElement>('logoInput')

const logoFraction = computed({
  get: () => style.value.logo?.fraction ?? 0.2,
  set: (value) => {
    if (style.value.logo) patch({ logo: { ...style.value.logo, fraction: value } })
  },
})

const logoPlate = computed({
  get: () => style.value.logo?.plate ?? true,
  set: (value) => {
    if (style.value.logo) patch({ logo: { ...style.value.logo, plate: value } })
  },
})

async function onLogoChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  logoError.value = ''
  choosingLogo.value = true
  try {
    const logo = await fromFile(file, style.value.logo?.fraction ?? 0.2, true)
    patch({ logo })
  } catch (caught) {
    logoError.value =
      caught instanceof ImageError ? caught.message : 'that picture could not be used'
  } finally {
    choosingLogo.value = false
  }
}

function removeLogo(): void {
  patch({ logo: null })
  logoError.value = ''
}

const maxLogoKB = Math.round(MAX_LOGO_BYTES / 1024)

// GovueTextarea and GovueSelect pick their id and description up from the
// surrounding GovueField on their own; the plain colour and range inputs
// below are not one of this package's controls, so they keep their own ids.
const foregroundId = useId()
const backgroundId = useId()
const logoFractionId = useId()
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent>
    <GovueField label="Text" hint="Anything a scanner can read back as plain text.">
      <GovueTextarea v-model="text" :rows="3" placeholder="https://example.org" />
    </GovueField>

    <div class="flex flex-wrap items-end gap-4">
      <div class="flex flex-col gap-1.5">
        <label :for="foregroundId" class="text-sm font-medium text-text">Foreground</label>
        <input :id="foregroundId" v-model="foreground" type="color" class="h-11 w-16 rounded-md" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label :for="backgroundId" class="text-sm font-medium text-text">Background</label>
        <input
          :id="backgroundId"
          v-model="background"
          type="color"
          class="h-11 w-16 rounded-md"
          :disabled="transparentBackground"
        />
      </div>

      <GovueCheckbox v-model="transparentBackground" label="Transparent background" />
    </div>

    <GovueField label="Module shape">
      <GovueSelect v-model="shape" :options="shapeOptions" />
    </GovueField>

    <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 class="text-base font-medium text-text">Logo</h3>
      <p class="text-sm text-text-muted">
        A logo covers part of the code, so the error correction level is raised to match how much of
        it the logo covers.
      </p>

      <GovueButton
        type="button"
        variant="secondary"
        class="w-fit"
        :loading="choosingLogo"
        @click="logoInput?.click()"
      >
        {{ hasLogo ? 'Replace logo' : 'Add a logo' }}
      </GovueButton>
      <input
        ref="logoInput"
        type="file"
        accept="image/*"
        class="sr-only"
        aria-label="Logo picture"
        :disabled="choosingLogo"
        @change="onLogoChosen"
      />
      <p class="text-sm text-text-muted">Up to {{ maxLogoKB }} KB.</p>
      <p v-if="logoError" role="alert" class="text-sm text-danger-text">{{ logoError }}</p>

      <template v-if="hasLogo">
        <div class="flex flex-col gap-1.5">
          <label :for="logoFractionId" class="text-sm font-medium text-text">Logo size</label>
          <input
            :id="logoFractionId"
            v-model.number="logoFraction"
            type="range"
            min="0.08"
            max="0.5"
            step="0.01"
          />
          <p class="text-sm text-text-muted">{{ Math.round(logoFraction * 100) }}% of the code</p>
        </div>

        <GovueCheckbox v-model="logoPlate" label="Plate behind the logo" />

        <GovueButton variant="quiet" type="button" @click="removeLogo">Remove logo</GovueButton>
      </template>
    </div>
  </form>
</template>
