<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { GovueButton, GovueCard, GovueField, GovueInput } from '@ostendorf-cloud/govue'

import { useQarrText } from '../i18n/messages'
import {
  applyTo,
  fromStyle,
  MAX_IMPORT_BYTES,
  MAX_LOGO_SIDE,
  MAX_NAME_LENGTH,
  MAX_TEMPLATES,
  type Template,
} from '../templates/schema'
import { createTemplateStore, type Failure } from '../templates/store'
import type { Style } from '../qr/style'

const style = defineModel<Style>('qrStyle', { required: true })

const props = defineProps<{
  /**
   * True while the content must stay free of a logo, as a SEPA code must:
   * the EPC format fixes error correction level M, which a logo's repair
   * would raise. A template then applies its colours and shape only.
   */
  logoBlocked?: boolean
}>()

const { t: text, locale } = useQarrText()
const t = (key: string, named?: Record<string, string | number>): string =>
  text(`templates.${key}`, named)

// The storage is opened once the page is in a browser: the prerender runs
// where there is none, and its markup must not claim that storing failed.
let store = createTemplateStore(null)
const available = ref(true)
const templates = ref<Template[]>([])

onMounted(() => {
  store = createTemplateStore()
  available.value = store.available
  templates.value = store.list()
})
const name = ref('')
const message = ref('')
const problem = ref('')
const renaming = ref<string | null>(null)
const renameTo = ref('')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const root = useTemplateRef<HTMLElement>('root')

const limits = { max: MAX_NAME_LENGTH, size: MAX_IMPORT_BYTES / 1024 / 1024 }

/** Moves focus once the DOM shows the new state. */
async function focus(selector: string): Promise<void> {
  await nextTick()
  root.value?.querySelector<HTMLElement>(selector)?.focus()
}

function say(ok: string): void {
  message.value = ok
  problem.value = ''
}

function fail(reason: Failure): void {
  message.value = ''
  problem.value = t(`error.${reason}`, {
    max: reason === 'limit' ? MAX_TEMPLATES : MAX_NAME_LENGTH,
  })
}

function refresh(): void {
  templates.value = store.list()
}

function save(): void {
  const result = store.save({ ...fromStyle(style.value, '', name.value) })
  if (!result.ok) return fail(result.reason)
  name.value = ''
  refresh()
  say(t('saved', { name: result.value.name }))
}

function apply(template: Template): void {
  const skipLogo = props.logoBlocked === true && template.logo !== null
  style.value = applyTo(style.value, template, !props.logoBlocked)
  say(
    skipLogo
      ? `${t('applied', { name: template.name })} ${t('logoSkipped')}`
      : t('applied', { name: template.name }),
  )
}

function startRename(template: Template): void {
  renaming.value = template.id
  renameTo.value = template.name
  void focus(`[data-template="${template.id}"] input`)
}

function cancelRename(template: Template): void {
  renaming.value = null
  void focus(`[data-template="${template.id}"] [data-action="rename"]`)
}

function commitRename(template: Template): void {
  const result = store.rename(template.id, renameTo.value)
  if (!result.ok) return fail(result.reason)
  renaming.value = null
  refresh()
  say(t('renamed', { name: result.value.name }))
  void focus(`[data-template="${template.id}"] [data-action="rename"]`)
}

function remove(template: Template): void {
  const at = templates.value.findIndex((entry) => entry.id === template.id)
  const result = store.remove(template.id)
  if (!result.ok) return fail(result.reason)
  refresh()
  say(t('removed', { name: template.name }))
  // The button that was pressed is gone: land on the next template, the
  // previous one when it was the last, or on the name field when none is left.
  const neighbour = templates.value[Math.min(at, templates.value.length - 1)]
  void focus(
    neighbour ? `[data-template="${neighbour.id}"] [data-action="apply"]` : '[data-name] input',
  )
}

function exportFile(): void {
  const blob = new Blob([store.exportText()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'qarr-templates.json'
  link.click()
  URL.revokeObjectURL(url)
  const count = templates.value.length
  say(count === 1 ? t('exportedOne') : t('exported', { count }))
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // Refused by its size before it is read at all.
  if (file.size > MAX_IMPORT_BYTES) {
    message.value = ''
    problem.value = t('error.fileTooLarge', limits)
    return
  }
  const result = store.importText(await file.text())
  if (!result.ok) return fail(result.reason)
  refresh()
  const { added, skipped } = result.value
  say(added === 1 ? t('importedOne', { skipped }) : t('imported', { added, skipped }))
}
</script>

<template>
  <!-- The page text is English only, so the panel carries its own language. -->
  <GovueCard :title="t('title')" as="section" :lang="locale()">
    <div ref="root" class="flex flex-col gap-4">
      <p class="text-sm text-text-muted">{{ t('intro') }}</p>
      <p v-if="!available" role="status" class="text-sm text-warning-text">
        {{ t('unavailable') }}
      </p>

      <form class="flex flex-wrap items-end gap-3" data-name @submit.prevent="save">
        <GovueField :label="t('nameLabel')" :hint="t('nameHint', limits)">
          <GovueInput v-model="name" :disabled="!available" />
        </GovueField>
        <GovueButton type="submit" variant="primary" :disabled="!available">
          {{ t('save') }}
        </GovueButton>
      </form>

      <p v-if="templates.length === 0" class="text-sm text-text-muted">{{ t('empty') }}</p>
      <ul v-else :aria-label="t('list')" class="flex flex-col gap-2">
        <li
          v-for="template in templates"
          :key="template.id"
          :data-template="template.id"
          class="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
        >
          <span
            class="h-6 w-6 rounded-sm border border-border"
            :style="{ background: template.foreground }"
            aria-hidden="true"
          />
          <span class="text-base text-text">{{ template.name }}</span>
          <span v-if="template.logo" class="text-sm text-text-muted">{{ t('hasLogo') }}</span>

          <form
            v-if="renaming === template.id"
            class="flex flex-wrap items-end gap-3"
            @submit.prevent="commitRename(template)"
          >
            <GovueField :label="t('renameLabel', { name: template.name })">
              <GovueInput v-model="renameTo" />
            </GovueField>
            <GovueButton type="submit" variant="primary">
              {{ t('renameSave') }}
            </GovueButton>
            <GovueButton type="button" variant="quiet" @click="cancelRename(template)">
              {{ t('cancel') }}
            </GovueButton>
          </form>
          <template v-else>
            <GovueButton
              type="button"
              variant="secondary"
              data-action="apply"
              :aria-label="`${t('apply')} ${template.name}`"
              @click="apply(template)"
            >
              {{ t('apply') }}
            </GovueButton>
            <GovueButton
              type="button"
              variant="quiet"
              data-action="rename"
              :aria-label="`${t('rename')} ${template.name}`"
              @click="startRename(template)"
            >
              {{ t('rename') }}
            </GovueButton>
            <GovueButton
              type="button"
              variant="quiet"
              data-action="remove"
              :aria-label="`${t('remove')} ${template.name}`"
              @click="remove(template)"
            >
              {{ t('remove') }}
            </GovueButton>
          </template>
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-3">
        <GovueButton
          type="button"
          variant="secondary"
          :disabled="templates.length === 0"
          @click="exportFile"
        >
          {{ t('export') }}
        </GovueButton>
        <GovueButton
          type="button"
          variant="secondary"
          :disabled="!available"
          @click="fileInput?.click()"
        >
          {{ t('import') }}
        </GovueButton>
        <!-- Opened by the button above, so it is no second tab stop. -->
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="sr-only"
          tabindex="-1"
          :aria-label="t('importLabel')"
          @change="importFile"
        />
      </div>
      <p class="text-sm text-text-muted">{{ t('importHint', limits) }}</p>
      <p class="text-sm text-text-muted">
        {{ t('stored', { side: MAX_LOGO_SIDE, max: MAX_TEMPLATES }) }}
      </p>

      <p v-if="message" role="status" class="text-sm text-text">{{ message }}</p>
      <p v-if="problem" role="alert" class="text-sm text-danger-text">{{ problem }}</p>
    </div>
  </GovueCard>
</template>
