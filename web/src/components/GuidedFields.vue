<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { reactive } from 'vue'
import {
  GovueCheckbox,
  GovueField,
  GovueInput,
  GovueSelect,
  GovueTextarea,
} from '@ostendorf-cloud/govue'

import { useQarrText } from '../i18n/messages'
import { isRequired, SPECS, type Errors, type FieldSpec, type GuidedKind } from '../qr/guided'
import type { Fields } from '../qr/guided'

const props = defineProps<{
  kind: GuidedKind
  errors: Errors
}>()

const fields = defineModel<Fields>({ required: true })
const { t } = useQarrText()

// An error shows once the person has left its field. A form nobody has
// touched is not a form full of mistakes.
const touched = reactive<Record<string, boolean>>({})

const HINTS: Record<string, string> = {
  'wifi.password': 'wifiPassword',
  'sepa.iban': 'sepaIban',
  'sepa.bic': 'sepaBic',
  'sepa.amount': 'sepaAmount',
  'tel.number': 'telNumber',
  'event.end': 'eventEnd',
}

function label(spec: FieldSpec): string {
  return t(`field.${props.kind}.${spec.key}`)
}

function hint(spec: FieldSpec): string | undefined {
  const key = HINTS[`${props.kind}.${spec.key}`]
  return key ? t(`hint.${key}`) : undefined
}

function error(spec: FieldSpec): string | undefined {
  const found = props.errors[spec.key]
  if (!found || !touched[spec.key]) return undefined
  return t(`error.${found.code}`, { min: found.min ?? 0, max: found.max ?? 0 })
}

function set(key: string, value: string): void {
  fields.value = { ...fields.value, [key]: value }
}

function options(spec: FieldSpec): { value: string; label: string }[] {
  return (spec.options ?? []).map((value) => ({ value, label: t(`option.${value}`) }))
}

const allDay = (): boolean => fields.value.allDay === 'true'

/**
 * Switching between a day and a moment keeps the date a person already
 * picked: a moment is cut down to its day, a day starts at midnight.
 */
function setAllDay(on: boolean): void {
  const convert = (value: string | undefined): string => {
    if (!value) return ''
    return on ? value.slice(0, 10) : value.length === 10 ? `${value}T00:00` : value
  }
  fields.value = {
    ...fields.value,
    allDay: on ? 'true' : '',
    start: convert(fields.value.start),
    end: convert(fields.value.end),
  }
}

function setCheck(spec: FieldSpec, on: boolean): void {
  if (props.kind === 'event' && spec.key === 'allDay') setAllDay(on)
  else set(spec.key, on ? 'true' : '')
}

function inputType(spec: FieldSpec): 'text' | 'password' | 'tel' | 'email' | 'url' {
  return spec.control === 'password' ||
    spec.control === 'tel' ||
    spec.control === 'email' ||
    spec.control === 'url'
    ? spec.control
    : 'text'
}

// A native date control: govue has no date field, and a typed date is the
// kind of input a person gets wrong without one.
const dateClasses = 'w-full min-h-11 rounded-md border bg-surface px-3 text-base text-text'
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-for="spec in SPECS[kind]" :key="spec.key">
      <GovueCheckbox
        v-if="spec.control === 'check'"
        :model-value="fields[spec.key] === 'true'"
        :label="label(spec)"
        @update:model-value="setCheck(spec, $event)"
      />

      <div v-else @focusout="touched[spec.key] = true">
        <GovueField
          v-slot="{ id, describedBy, invalid }"
          :label="label(spec)"
          :hint="hint(spec)"
          :error="error(spec)"
          :required="isRequired(spec, fields)"
        >
          <GovueSelect
            v-if="spec.control === 'select'"
            :model-value="fields[spec.key] ?? ''"
            :options="options(spec)"
            @update:model-value="set(spec.key, $event)"
          />
          <GovueTextarea
            v-else-if="spec.control === 'textarea'"
            :model-value="fields[spec.key] ?? ''"
            :rows="3"
            @update:model-value="set(spec.key, $event)"
          />
          <input
            v-else-if="spec.control === 'datetime'"
            :id="id"
            :type="allDay() ? 'date' : 'datetime-local'"
            :value="fields[spec.key] ?? ''"
            :class="[
              dateClasses,
              invalid ? 'border-danger-strong' : 'border-border-strong hover:border-accent',
            ]"
            :required="isRequired(spec, fields)"
            :aria-describedby="describedBy"
            :aria-invalid="invalid ? 'true' : undefined"
            @input="set(spec.key, ($event.target as HTMLInputElement).value)"
          />
          <GovueInput
            v-else
            :model-value="fields[spec.key] ?? ''"
            :type="inputType(spec)"
            :placeholder="spec.placeholder"
            :autocomplete="spec.autocomplete"
            @update:model-value="set(spec.key, $event)"
          />
        </GovueField>
      </div>
    </template>
  </div>
</template>
