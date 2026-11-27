<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import {
  GovueButton,
  GovueCheckbox,
  GovueField,
  GovueSelect,
  GovueTextarea,
} from '@ostendorf-cloud/govue'

import { useQarrText } from '../i18n/messages'
import { emptyFields, isKind, KINDS, type AllFields, type Errors, type Kind } from '../qr/guided'
import { fetchPreset, labelOf, listPresets, type Preset } from '../presets/presets'
import { fromFile, ImageError, MAX_LOGO_BYTES } from '../qr/logo'
import type { Style } from '../qr/style'
import GuidedFields from './GuidedFields.vue'

const props = withDefaults(
  defineProps<{
    /** What the guided form refuses, by field key. */
    errors?: Errors
    /** What the last switch of kind left behind, to say so. */
    notice?: { from: Kind; dropped: string[] } | null
    /** True for a SEPA code, which takes no logo (EPC069-12 fixes level M). */
    logoBlocked?: boolean
  }>(),
  { errors: () => ({}), notice: null, logoBlocked: false },
)

const emit = defineEmits<{ switchKind: [kind: Kind] }>()

const { t, locale } = useQarrText()

const text = defineModel<string>('text', { default: '' })
const kind = defineModel<Kind>('kind', { default: 'text' })
const fields = defineModel<AllFields>('fields', { default: () => emptyFields() })

const guidedKind = computed(() => (kind.value === 'text' ? null : kind.value))

const kindOptions = computed(() => KINDS.map((value) => ({ value, label: t(`kind.${value}`) })))

function onKind(value: string): void {
  if (isKind(value) && value !== kind.value) emit('switchKind', value)
}

const droppedText = computed(() => {
  if (!props.notice) return ''
  const from = props.notice.from
  const names = props.notice.dropped.map((key) =>
    from === 'text' ? t('kind.text') : t(`field.${from}.${key}`),
  )
  return t('switched.dropped', { from: t(`kind.${from}`), fields: names.join(', ') })
})

function setFields(next: Record<string, string>): void {
  if (!guidedKind.value) return
  fields.value = { ...fields.value, [guidedKind.value]: next }
}
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

/** Reads a picture as the logo. A file from the device and a preset both end here. */
async function useLogoFile(file: File): Promise<void> {
  const logo = await fromFile(file, style.value.logo?.fraction ?? 0.2, true)
  patch({ logo })
}

async function onLogoChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  logoError.value = ''
  choosingLogo.value = true
  try {
    // A picture from the device is read in this tab and never requested from
    // or sent to the server.
    await useLogoFile(file)
  } catch (caught) {
    logoError.value =
      caught instanceof ImageError ? caught.message : 'that picture could not be used'
  } finally {
    choosingLogo.value = false
  }
}

// The presets a deployment offers. An empty list, a failed request and a
// deployment with no source all look the same: the box offers upload only.
const presets = ref<Preset[]>([])
const presetsAbort = new AbortController()

onMounted(async () => {
  presets.value = await listPresets(presetsAbort.signal)
})
onBeforeUnmount(() => presetsAbort.abort())

async function onPresetChosen(preset: Preset): Promise<void> {
  logoError.value = ''
  choosingLogo.value = true
  try {
    await useLogoFile(await fetchPreset(preset, presetsAbort.signal))
  } catch (caught) {
    logoError.value = caught instanceof ImageError ? caught.message : t('logo.presetFailed')
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
    <!-- The page text is English only, so the texts of the guided input carry
         the language of the address on their own. -->
    <div class="flex flex-col gap-2" :lang="locale()">
      <GovueField :label="t('kind.label')" :hint="t('kind.hint')">
        <GovueSelect :model-value="kind" :options="kindOptions" @update:model-value="onKind" />
      </GovueField>
      <p v-if="droppedText" role="status" class="text-sm text-warning-text">{{ droppedText }}</p>
    </div>

    <GovueField
      v-if="kind === 'text'"
      label="Text"
      hint="Anything a scanner can read back as plain text."
    >
      <GovueTextarea v-model="text" :rows="3" placeholder="https://example.org" />
    </GovueField>
    <div v-else-if="guidedKind" :lang="locale()">
      <GuidedFields
        :key="guidedKind"
        :kind="guidedKind"
        :errors="errors"
        :model-value="fields[guidedKind]"
        @update:model-value="setFields"
      />
    </div>

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
      <p class="text-sm text-text-muted">
        A shared link never carries this logo: reopening it always starts logo-free.
      </p>

      <GovueButton
        type="button"
        variant="secondary"
        class="w-fit"
        :loading="choosingLogo"
        :disabled="logoBlocked"
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
        tabindex="-1"
        :disabled="choosingLogo || logoBlocked"
        @change="onLogoChosen"
      />
      <p v-if="logoBlocked" :lang="locale()" class="text-sm text-text-muted">
        {{ t('logo.sepaBlocked') }}
      </p>
      <p class="text-sm text-text-muted">Up to {{ maxLogoKB }} KB.</p>

      <div v-if="presets.length > 0" :lang="locale()" class="flex flex-col gap-2">
        <h4 id="preset-heading" class="text-sm font-medium text-text">{{ t('logo.presets') }}</h4>
        <ul aria-labelledby="preset-heading" class="flex flex-wrap gap-2">
          <li v-for="preset in presets" :key="preset.name">
            <GovueButton
              type="button"
              variant="secondary"
              :disabled="choosingLogo || logoBlocked"
              @click="onPresetChosen(preset)"
            >
              {{ labelOf(preset) }}
            </GovueButton>
          </li>
        </ul>
      </div>
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
