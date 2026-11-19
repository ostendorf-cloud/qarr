// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { createGovueI18n } from '@ostendorf-cloud/govue'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import { messages } from '../i18n/messages'
import { render as drawCode } from '../qr/render'
import { defaultStyle, type Style } from '../qr/style'
import { LIST_KEY } from '../templates/store'
import TemplatePanel from './TemplatePanel.vue'

/** Hosts the panel with a live style, the way App.vue does. */
function host(initial: Style, logoBlocked = false) {
  const style = ref<Style>(initial)
  const Host = defineComponent({
    components: { TemplatePanel },
    setup: () => ({ style, logoBlocked }),
    template: '<TemplatePanel v-model:qr-style="style" :logo-blocked="logoBlocked" />',
  })
  return { style, Host }
}

function mountPanel(
  initial: Style = defaultStyle(),
  options: { locale?: string; logoBlocked?: boolean } = {},
) {
  const { style, Host } = host(initial, options.logoBlocked)
  const view = render(Host, {
    global: options.locale
      ? { plugins: [createGovueI18n({ locale: options.locale, messages })] }
      : {},
  })
  return { style, view }
}

function styled(): Style {
  const style = defaultStyle()
  style.foreground = '#112233'
  style.background = '#ffeedd'
  style.shape = 'round'
  style.logo = {
    pixels: new Uint8ClampedArray(4 * 4 * 4).fill(90),
    width: 4,
    height: 4,
    fraction: 0.2,
    plate: true,
  }
  return style
}

async function save(name: string) {
  await fireEvent.update(screen.getByLabelText('Template name'), name)
  await fireEvent.click(screen.getByRole('button', { name: 'Save current look' }))
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('TemplatePanel', () => {
  it('saves the current look under a name and lists it', async () => {
    mountPanel(styled())

    await save('Brand')

    const list = await screen.findByRole('list', { name: 'Saved templates' })
    expect(within(list).getByText('Brand')).toBeVisible()
    expect(within(list).getByText('with logo')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Saved as Brand.')
  })

  it('shows a saved template again after a reload', async () => {
    const first = mountPanel(styled())
    await save('Brand')
    first.view.unmount()

    mountPanel()

    expect(await screen.findByText('Brand')).toBeVisible()
  })

  it('applies colours, shape and logo, and the code equals one set by hand', async () => {
    const saved = styled()
    const first = mountPanel(saved)
    await save('Brand')
    first.view.unmount()

    const { style } = mountPanel()
    await fireEvent.click(await screen.findByRole('button', { name: 'Apply Brand' }))

    const byHand = defaultStyle()
    byHand.foreground = '#112233'
    byHand.background = '#ffeedd'
    byHand.shape = 'round'
    byHand.logo = saved.logo
    expect(style.value).toEqual(byHand)
    const applied = drawCode('https://example.org', style.value)
    const expected = drawCode('https://example.org', byHand)
    expect(applied.level).toBe(expected.level)
    expect(Array.from(applied.pixels)).toEqual(Array.from(expected.pixels))
  })

  it('applies colours only when the content must stay free of a logo', async () => {
    const first = mountPanel(styled())
    await save('Brand')
    first.view.unmount()

    const { style } = mountPanel(defaultStyle(), { logoBlocked: true })
    await fireEvent.click(await screen.findByRole('button', { name: 'Apply Brand' }))

    expect(style.value.foreground).toBe('#112233')
    expect(style.value.logo).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('SEPA')
  })

  it('renames, numbering a name that is taken', async () => {
    mountPanel()
    await save('One')
    await save('Two')

    await fireEvent.click(await screen.findByRole('button', { name: 'Rename Two' }))
    await fireEvent.update(screen.getByLabelText('New name for Two'), 'One')
    await fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByText('One (2)')).toBeVisible()
  })

  it('deletes a template and its stored data', async () => {
    mountPanel(styled())
    await save('Brand')

    await fireEvent.click(await screen.findByRole('button', { name: 'Delete Brand' }))

    expect(screen.getByText('No templates saved yet.')).toBeVisible()
    expect(localStorage.getItem(LIST_KEY)).toBe('[]')
    expect(Object.keys(localStorage).filter((k) => k.includes('logo'))).toEqual([])
  })

  it('reports an empty name instead of saving', async () => {
    mountPanel()

    await save('   ')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name')
    expect(screen.getByText('No templates saved yet.')).toBeVisible()
  })

  it('says it cannot store when the browser blocks storage, and stays usable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.stubGlobal('localStorage', undefined)
    mountPanel()

    expect(await screen.findByText(/does not allow storing data/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save current look' })).toBeDisabled()
    expect(screen.getByText('No templates saved yet.')).toBeVisible()
    vi.restoreAllMocks()
  })

  it('exports a file with the templates', async () => {
    mountPanel(styled())
    await save('Brand')
    let blob: Blob | null = null
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob
      return 'blob:x'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await fireEvent.click(screen.getByRole('button', { name: 'Export templates' }))

    const text = await (blob as unknown as Blob).text()
    expect(JSON.parse(text).templates[0].name).toBe('Brand')
  })

  it('imports a file and reports what it kept', async () => {
    const source = mountPanel(styled())
    await save('Brand')
    let blob: Blob | null = null
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blob = b as Blob
      return 'blob:x'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await fireEvent.click(screen.getByRole('button', { name: 'Export templates' }))
    const file = new File([await (blob as unknown as Blob).text()], 'qarr-templates.json', {
      type: 'application/json',
    })
    source.view.unmount()
    localStorage.clear()

    mountPanel()
    await fireEvent.change(screen.getByLabelText('Template file'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('Imported 1 template, skipped 0.')).toBeVisible())
    expect(screen.getByText('Brand')).toBeVisible()
  })

  it('refuses a file that is no export, and one that is too large, before keeping anything', async () => {
    mountPanel()

    await fireEvent.change(screen.getByLabelText('Template file'), {
      target: { files: [new File(['hello'], 'x.json')] },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('not a template export'),
    )

    const huge = new File(['x'], 'big.json')
    Object.defineProperty(huge, 'size', { value: 5 * 1024 * 1024 })
    await fireEvent.change(screen.getByLabelText('Template file'), { target: { files: [huge] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('larger than 4 MB'))
  })

  it('sends nothing anywhere while saving, applying, exporting and importing', async () => {
    const fetchSpy = vi.fn()
    const beacon = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        open = open
      },
    )
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          open()
        }
      },
    )
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    mountPanel(styled())

    await save('Brand')
    await fireEvent.click(await screen.findByRole('button', { name: 'Apply Brand' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Export templates' }))
    await fireEvent.change(screen.getByLabelText('Template file'), {
      target: { files: [new File(['{}'], 'x.json')] },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Delete Brand' }))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('speaks German when the page language is German', async () => {
    mountPanel(styled(), { locale: 'de' })

    expect(screen.getByRole('heading', { name: 'Vorlagen' })).toBeVisible()
    await fireEvent.update(screen.getByLabelText('Name der Vorlage'), 'Marke')
    await fireEvent.click(screen.getByRole('button', { name: 'Aktuelles Aussehen speichern' }))

    expect(await screen.findByRole('button', { name: 'Anwenden Marke' })).toBeVisible()
    expect(screen.getByText(/nur in diesem Browser/)).toBeVisible()
  })

  it('marks the panel with the language of its texts, heading included', () => {
    mountPanel(styled(), { locale: 'de' })

    const panel = screen.getByRole('heading', { name: 'Vorlagen' }).closest('[lang]')
    expect(panel).toHaveAttribute('lang', 'de')
  })

  it('says the plural right in both languages', async () => {
    mountPanel(styled(), { locale: 'de' })
    await fireEvent.update(screen.getByLabelText('Name der Vorlage'), 'Marke')
    await fireEvent.click(screen.getByRole('button', { name: 'Aktuelles Aussehen speichern' }))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await fireEvent.click(await screen.findByRole('button', { name: 'Vorlagen exportieren' }))

    expect(screen.getByText('1 Vorlage exportiert.')).toBeVisible()
  })

  it('moves focus to the next template after a delete, and to the name field after the last', async () => {
    mountPanel()
    await save('One')
    await save('Two')

    await fireEvent.click(await screen.findByRole('button', { name: 'Delete One' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply Two' })).toHaveFocus())

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Two' }))
    await waitFor(() => expect(screen.getByLabelText('Template name')).toHaveFocus())
  })

  it('moves focus into the rename field, and back to Rename after saving or cancelling', async () => {
    mountPanel()
    await save('One')

    await fireEvent.click(await screen.findByRole('button', { name: 'Rename One' }))
    await waitFor(() => expect(screen.getByLabelText('New name for One')).toHaveFocus())
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename One' })).toHaveFocus())

    await fireEvent.click(screen.getByRole('button', { name: 'Rename One' }))
    await fireEvent.update(screen.getByLabelText('New name for One'), 'Uno')
    await fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Uno' })).toHaveFocus())
  })

  it('submits a rename on Enter', async () => {
    mountPanel()
    await save('One')

    await fireEvent.click(await screen.findByRole('button', { name: 'Rename One' }))
    const field = screen.getByLabelText('New name for One')
    await fireEvent.update(field, 'Uno')
    await fireEvent.submit(field.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Uno')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Renamed to Uno.')
  })

  it('keeps the hidden file input out of the tab order', () => {
    mountPanel()

    expect(screen.getByLabelText('Template file')).toHaveAttribute('tabindex', '-1')
  })

  it('names the stored logo size and the number of templates kept', () => {
    mountPanel()

    expect(screen.getByText(/at most 256 by 256 pixels/)).toBeVisible()
    expect(screen.getByText(/At most 8 templates/)).toBeVisible()
  })
})
