// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultStyle } from '../qr/style'
import {
  MAX_IMPORT_BYTES,
  MAX_LOGO_SIDE,
  MAX_LOGO_TEXT,
  MAX_NAME_LENGTH,
  MAX_TEMPLATES,
  fromStyle,
  parseTemplate,
  toRecord,
  toBase64,
  type Template,
} from './schema'
import { createTemplateStore, LIST_KEY, LOGO_KEY } from './store'

function logoOf(side: number, seed = 7) {
  const pixels = new Uint8ClampedArray(side * side * 4)
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * seed) % 256
  return { pixels, width: side, height: side, fraction: 0.2, plate: true }
}

function input(name: string, side = 0): Omit<Template, 'id'> {
  const style = defaultStyle()
  style.foreground = '#336699'
  style.background = ''
  style.shape = 'round'
  if (side > 0) style.logo = logoOf(side)
  return fromStyle(style, 'x', name)
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the template store', () => {
  it('keeps a template across a reload, logo pixels included', () => {
    const saved = createTemplateStore().save(input('Brand', 6))
    expect(saved.ok).toBe(true)

    // A new store on the same storage is what a reload is.
    const [back] = createTemplateStore().list()

    expect(back.name).toBe('Brand')
    expect(back.foreground).toBe('#336699')
    expect(back.background).toBe('')
    expect(back.shape).toBe('round')
    expect(back.logo?.width).toBe(6)
    expect(Array.from(back.logo?.pixels ?? [])).toEqual(Array.from(logoOf(6).pixels))
  })

  it('keeps the logo in its own record, not in the list', () => {
    const saved = createTemplateStore().save(input('Brand', 6))
    if (!saved.ok) throw new Error('save failed')

    expect(localStorage.getItem(LIST_KEY)).not.toContain(toBase64(logoOf(6).pixels))
    expect(localStorage.getItem(LOGO_KEY + saved.value.id)).toBe(toBase64(logoOf(6).pixels))
  })

  it('drops a corrupted entry and keeps the others, and forgets its logo', () => {
    const store = createTemplateStore()
    store.save(input('Good'))
    const bad = store.save(input('Bad', 4))
    if (!bad.ok) throw new Error('save failed')
    const list = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as Array<{ id: string }>
    // Truncated pixel data: the entry no longer matches its own size.
    localStorage.setItem(LOGO_KEY + bad.value.id, 'AAAA')

    expect(
      createTemplateStore()
        .list()
        .map((t) => t.name),
    ).toEqual(['Good'])
    expect(JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]')).toHaveLength(list.length - 1)
    expect(localStorage.getItem(LOGO_KEY + bad.value.id)).toBeNull()
  })

  it.each([
    ['not JSON', '{nope'],
    ['not a list', '{"a":1}'],
    ['a list of junk', '[1,"x",null,[]]'],
  ])('survives a list that is %s', (_label, text) => {
    localStorage.setItem(LIST_KEY, text)

    expect(createTemplateStore().list()).toEqual([])
  })

  it.each([
    [
      'a script in the name is kept as text only, never executed',
      { name: '<img src=x onerror=1>' },
      true,
    ],
    ['a colour that is not #rrggbb', { foreground: 'red' }, false],
    ['a CSS injection as colour', { foreground: '#000000; background:url(x)' }, false],
    ['a shape that is not known', { shape: 'star' }, false],
    ['an empty name', { name: '' }, false],
    ['a name with a line break', { name: 'a\nb' }, false],
    ['a name beyond the cap', { name: 'x'.repeat(MAX_NAME_LENGTH + 1) }, false],
    ['an id that could address another key', { id: '../list' }, false],
  ])('checks %s', (_label, change, accepted) => {
    const entry = {
      id: 'abc123',
      name: 'Ok',
      foreground: '#000000',
      background: '#ffffff',
      shape: 'square',
      logo: null,
      ...change,
    }
    localStorage.setItem(LIST_KEY, JSON.stringify([entry]))

    expect(createTemplateStore().list()).toHaveLength(accepted ? 1 : 0)
  })

  it.each([
    ['pixels larger than the size says', { width: 3, height: 3 }, toBase64(logoOf(4).pixels)],
    ['a side beyond the cap', { width: MAX_LOGO_SIDE + 1, height: 1 }, 'AAAA'],
    ['a fraction beyond the range', { fraction: 0.9 }, toBase64(logoOf(2).pixels)],
    ['not base64', {}, 'not base64!!'],
    ['a text beyond the cap', {}, 'A'.repeat(400_000)],
  ])('refuses a stored logo with %s', (_label, change, data) => {
    const logo = { width: 2, height: 2, fraction: 0.2, plate: true, ...change }
    localStorage.setItem(
      LIST_KEY,
      JSON.stringify([
        { id: 'abc123', name: 'L', foreground: '#000000', background: '', shape: 'square', logo },
      ]),
    )
    localStorage.setItem(LOGO_KEY + 'abc123', data)

    expect(createTemplateStore().list()).toEqual([])
  })

  it('keeps at most the cap, however many are stored', () => {
    const many = Array.from({ length: MAX_TEMPLATES + 5 }, (_v, i) => ({
      id: `id${i}`,
      name: `T${i}`,
      foreground: '#000000',
      background: '',
      shape: 'square',
      logo: null,
    }))
    localStorage.setItem(LIST_KEY, JSON.stringify(many))

    expect(createTemplateStore().list()).toHaveLength(MAX_TEMPLATES)
  })

  it('refuses a save past the cap', () => {
    const store = createTemplateStore()
    for (let i = 0; i < MAX_TEMPLATES; i++) expect(store.save(input(`T${i}`)).ok).toBe(true)

    expect(store.save(input('One more'))).toEqual({ ok: false, reason: 'limit' })
  })

  it('numbers a name that is taken, ignoring case', () => {
    const store = createTemplateStore()
    store.save(input('Brand'))
    store.save(input('brand'))
    store.save(input('BRAND'))

    expect(store.list().map((t) => t.name)).toEqual(['Brand', 'brand (2)', 'BRAND (3)'])
  })

  it('renames, numbers a taken name and keeps the id', () => {
    const store = createTemplateStore()
    store.save(input('A'))
    const b = store.save(input('B'))
    if (!b.ok) throw new Error('save failed')

    const renamed = store.rename(b.value.id, 'A')

    expect(renamed.ok && renamed.value.name).toBe('A (2)')
    expect(renamed.ok && renamed.value.id).toBe(b.value.id)
    expect(store.rename(b.value.id, '  ')).toEqual({ ok: false, reason: 'name' })
    expect(store.rename('nope', 'X')).toEqual({ ok: false, reason: 'missing' })
  })

  it('deletes a template and its logo record', () => {
    const store = createTemplateStore()
    const saved = store.save(input('A', 4))
    if (!saved.ok) throw new Error('save failed')

    expect(store.remove(saved.value.id).ok).toBe(true)

    expect(store.list()).toEqual([])
    expect(localStorage.getItem(LOGO_KEY + saved.value.id)).toBeNull()
  })

  it('refuses a logo above the stored size before writing anything', () => {
    const result = createTemplateStore().save(input('Big', MAX_LOGO_SIDE + 1))

    expect(result).toEqual({ ok: false, reason: 'logo' })
    expect(localStorage.length).toBe(0)
  })

  it('reports a refused write and leaves the earlier templates intact', () => {
    const store = createTemplateStore()
    store.save(input('Keep', 4))
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    let result
    try {
      result = store.save(input('New', 4))
    } finally {
      Storage.prototype.setItem = real
    }

    expect(result).toEqual({ ok: false, reason: 'full' })
    expect(
      createTemplateStore()
        .list()
        .map((t) => t.name),
    ).toEqual(['Keep'])
  })

  it('puts the earlier list back when a later write is refused', () => {
    const store = createTemplateStore()
    const keep = store.save(input('Keep', 4))
    if (!keep.ok) throw new Error('save failed')
    // The logos are written before the list, so refusing the list leaves the
    // new logo record behind unless the rollback removes it.
    const real = Storage.prototype.setItem
    let refused = false
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === LIST_KEY && !refused) {
        refused = true
        throw new DOMException('full', 'QuotaExceededError')
      }
      real.call(this, key, value)
    }
    let result
    try {
      result = store.save(input('New', 4))
    } finally {
      Storage.prototype.setItem = real
    }

    expect(result).toEqual({ ok: false, reason: 'full' })
    expect(Object.keys(localStorage).sort()).toEqual([LIST_KEY, LOGO_KEY + keep.value.id].sort())
  })

  it('keeps a good template when the cleanup write of an invalid entry is refused', () => {
    createTemplateStore().save(input('Good'))
    const list = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as unknown[]
    list.push({ id: 'bad1', name: '', foreground: 'red', background: '', shape: 'x', logo: null })
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
    const real = Storage.prototype.setItem
    let refused = false
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === LIST_KEY && !refused) {
        refused = true
        throw new DOMException('full', 'QuotaExceededError')
      }
      real.call(this, key, value)
    }
    let result
    try {
      result = createTemplateStore().save(input('New'))
    } finally {
      Storage.prototype.setItem = real
    }

    expect(refused).toBe(true)
    expect(result.ok).toBe(true)
    expect(
      createTemplateStore()
        .list()
        .map((t) => t.name),
    ).toEqual(['Good', 'New'])
  })

  it('commits nothing when the list could not be read', () => {
    const store = createTemplateStore()
    const good = store.save(input('Good', 4))
    if (!good.ok) throw new Error('save failed')
    const before = { ...localStorage }
    const realGet = Storage.prototype.getItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    Storage.prototype.getItem = function (this: Storage, key: string) {
      if (key === LIST_KEY) throw new DOMException('blocked', 'SecurityError')
      return realGet.call(this, key)
    }
    const file = JSON.stringify({
      format: 'qarr-templates',
      version: 1,
      templates: [toRecord({ ...input('Extra'), id: 'x' })],
    })
    let results
    try {
      results = [
        store.save(input('New')),
        store.rename(good.value.id, 'Other'),
        store.remove(good.value.id),
        store.importText(file),
      ]
    } finally {
      Storage.prototype.getItem = realGet
    }

    for (const result of results) expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect({ ...localStorage }).toEqual(before)
    setItem.mockRestore()
    removeItem.mockRestore()
  })

  it('removes logo records no list refers to on the next write, also with no list at all', () => {
    localStorage.setItem(LOGO_KEY + 'orphan', toBase64(logoOf(4).pixels))

    const saved = createTemplateStore().save(input('A'))

    expect(saved.ok).toBe(true)
    expect(localStorage.getItem(LOGO_KEY + 'orphan')).toBeNull()
  })

  it('works with no storage at all: empty, and a save says it cannot', () => {
    const store = createTemplateStore(null)

    expect(store.available).toBe(false)
    expect(store.list()).toEqual([])
    expect(store.save(input('A'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(store.importText('{}')).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('treats storage that throws on every call as empty', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
      clear: () => undefined,
    } as Storage
    const store = createTemplateStore(broken)

    expect(store.list()).toEqual([])
    expect(store.save(input('A')).ok).toBe(false)
  })

  it('starts empty after the storage was cleared', () => {
    createTemplateStore().save(input('A', 4))
    localStorage.clear()

    expect(createTemplateStore().list()).toEqual([])
  })
})

describe('export and import', () => {
  it('round trips every template through a file', () => {
    const store = createTemplateStore()
    store.save(input('A', 4))
    store.save(input('B'))
    const file = store.exportText()
    localStorage.clear()

    const result = createTemplateStore().importText(file)

    expect(result).toEqual({ ok: true, value: { added: 2, skipped: 0 } })
    const back = createTemplateStore().list()
    expect(back.map((t) => t.name)).toEqual(['A', 'B'])
    expect(Array.from(back[0].logo?.pixels ?? [])).toEqual(Array.from(logoOf(4).pixels))
  })

  it('numbers imported names that are taken', () => {
    const store = createTemplateStore()
    store.save(input('A'))

    store.importText(store.exportText())

    expect(store.list().map((t) => t.name)).toEqual(['A', 'A (2)'])
  })

  it('skips invalid entries and reports how many', () => {
    const good = toRecord({ ...input('Good'), id: 'x' })
    const text = JSON.stringify({
      format: 'qarr-templates',
      version: 1,
      templates: [good, { ...good, foreground: 'red' }, 5],
    })

    expect(createTemplateStore().importText(text)).toEqual({
      ok: true,
      value: { added: 1, skipped: 2 },
    })
  })

  it('stops at the cap and reports the rest as skipped', () => {
    const record = toRecord({ ...input('T'), id: 'x' })
    const text = JSON.stringify({
      format: 'qarr-templates',
      version: 1,
      templates: Array.from({ length: MAX_TEMPLATES + 2 }, () => record),
    })

    expect(createTemplateStore().importText(text)).toEqual({
      ok: true,
      value: { added: MAX_TEMPLATES, skipped: 2 },
    })
  })

  it('refuses a file over the size cap before parsing it', () => {
    const parse = vi.spyOn(JSON, 'parse')

    const result = createTemplateStore().importText(' '.repeat(MAX_IMPORT_BYTES + 1))

    expect(result).toEqual({ ok: false, reason: 'limit' })
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it.each([
    ['not JSON', 'hello'],
    ['another format', '{"format":"other","version":1,"templates":[]}'],
    ['another version', '{"format":"qarr-templates","version":2,"templates":[]}'],
    ['no list', '{"format":"qarr-templates","version":1}'],
  ])('refuses a file that is %s', (_label, text) => {
    expect(createTemplateStore().importText(text)).toEqual({ ok: false, reason: 'format' })
  })
})

describe('parseTemplate', () => {
  const base = { name: 'A', foreground: '#000000', background: '', shape: 'square' }

  it('refuses logo text over the cap before decoding it', () => {
    // The sides are right and the text is the one thing wrong: a text this
    // long is refused without ever reaching atob.
    const atob = vi.spyOn(globalThis, 'atob')
    const data = 'A'.repeat(MAX_LOGO_TEXT + 4)

    const parsed = parseTemplate(
      {
        ...base,
        logo: { width: MAX_LOGO_SIDE, height: MAX_LOGO_SIDE, fraction: 0.2, plate: true, data },
      },
      'abc',
    )

    expect(parsed).toBeNull()
    expect(atob).not.toHaveBeenCalled()
    atob.mockRestore()
  })

  it.each([
    [MAX_LOGO_SIDE + 1, 1],
    [1, MAX_LOGO_SIDE + 1],
    [0, 4],
    [4, 0],
    [1.5, 4],
  ])(
    'refuses the logo sides %s by %s even when the data has exactly that size',
    (width, height) => {
      const data = toBase64(new Uint8ClampedArray(Math.max(0, Math.round(width * height * 4))))

      const parsed = parseTemplate(
        { ...base, logo: { width, height, fraction: 0.2, plate: true, data } },
        'abc',
      )

      expect(parsed).toBeNull()
    },
  )

  it('accepts the largest logo side', () => {
    const data = toBase64(new Uint8ClampedArray(MAX_LOGO_SIDE * 4))

    const parsed = parseTemplate(
      { ...base, logo: { width: MAX_LOGO_SIDE, height: 1, fraction: 0.2, plate: true, data } },
      'abc',
    )

    expect(parsed?.logo?.width).toBe(MAX_LOGO_SIDE)
  })

  it('lower cases colours and builds its own value', () => {
    const parsed = parseTemplate(
      {
        name: ' A  b ',
        foreground: '#ABCDEF',
        background: '',
        shape: 'square',
        logo: null,
        extra: 1,
      },
      'abc',
    )

    expect(parsed).toEqual({
      id: 'abc',
      name: 'A b',
      foreground: '#abcdef',
      background: '',
      shape: 'square',
      logo: null,
    })
  })
})
