// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved templates in the browser's local storage, and their export and
 * import as a file. Nothing here makes a network request.
 *
 * Two kinds of record, so a logo never sits in the small metadata record:
 * `qarr.templates` holds the list (names, colours, shape, and for a logo
 * only its size and settings), `qarr.template-logo.<id>` holds one logo's
 * pixels as base64. Local storage rather than IndexedDB: both are per
 * origin and local, but the access is synchronous, the page needs no
 * asynchronous state, and the bounded sizes in schema.ts keep eight
 * templates inside the usual 5 MB quota. A save that the quota refuses is
 * reported and leaves nothing behind.
 *
 * Storage that is missing, blocked or cleared leaves the page working: the
 * list is then simply empty and a save says it cannot.
 */

import {
  cleanName,
  isId,
  MAX_IMPORT_BYTES,
  MAX_TEMPLATES,
  newId,
  parseTemplate,
  toRecord,
  uniqueName,
  type Template,
  type TemplateRecord,
} from './schema'

export const LIST_KEY = 'qarr.templates'
export const LOGO_KEY = 'qarr.template-logo.'
export const FILE_FORMAT = 'qarr-templates'

export type Failure = 'unavailable' | 'full' | 'limit' | 'name' | 'format' | 'logo' | 'missing'
export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: Failure }

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Reading the property throws when site data is blocked.
    return null
  }
}

/** The list as stored, each entry without its logo pixels. */
interface ListEntry extends Omit<TemplateRecord, 'logo'> {
  id: string
  logo: Omit<NonNullable<TemplateRecord['logo']>, 'data'> | null
}

function listEntry(template: Template): ListEntry {
  const { logo, ...rest } = toRecord(template)
  return {
    id: template.id,
    ...rest,
    logo: logo
      ? { width: logo.width, height: logo.height, fraction: logo.fraction, plate: logo.plate }
      : null,
  }
}

export interface TemplateStore {
  available: boolean
  list(): Template[]
  save(template: Omit<Template, 'id'>): Outcome<Template>
  rename(id: string, name: string): Outcome<Template>
  remove(id: string): Outcome<null>
  /** All templates as the text of an export file. */
  exportText(): string
  /** Reads an export file's text and keeps what is valid, up to the cap. */
  importText(text: string): Outcome<{ added: number; skipped: number }>
}

export function createTemplateStore(storage: Storage | null = defaultStorage()): TemplateStore {
  /**
   * The valid templates, or null when storage could not be read at all. An
   * empty list is a real answer; null is not, and no mutation may commit on
   * top of it, or it would overwrite what it could not see.
   *
   * Orphan logo records (the list record is missing) are not removed here:
   * every write removes any logo record no template refers to.
   */
  function load(): Template[] | null {
    if (!storage) return null
    const kept: Template[] = []
    let dirty = false
    try {
      const text = storage.getItem(LIST_KEY)
      if (text === null) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
      const entries = Array.isArray(parsed) ? parsed : []
      if (!Array.isArray(parsed)) dirty = true
      const seen = new Set<string>()
      for (const entry of entries.slice(0, MAX_TEMPLATES)) {
        const id = (entry as { id?: unknown } | null)?.id
        if (!isId(id) || seen.has(id)) {
          dirty = true
          continue
        }
        let data: string | null = null
        const logo = (entry as { logo?: unknown }).logo
        if (logo !== null && typeof logo === 'object') {
          data = storage.getItem(LOGO_KEY + id)
        }
        const raw = {
          ...(entry as object),
          logo: logo !== null && typeof logo === 'object' ? { ...logo, data } : logo,
        }
        const template = parseTemplate(raw, id)
        if (!template) {
          dirty = true
          continue
        }
        seen.add(id)
        kept.push(template)
      }
      if (entries.length > MAX_TEMPLATES) dirty = true
    } catch {
      return null
    }
    if (dirty) {
      // Only the cleanup is allowed to fail: what was read stays valid.
      try {
        write(kept)
      } catch {
        // The next write tries again.
      }
    }
    return kept
  }

  function read(): Template[] {
    return load() ?? []
  }

  /** Writes the list and every logo, then drops logos nothing refers to. */
  function write(templates: Template[]): void {
    if (!storage) throw new Error('no storage')
    const known = new Set(templates.map((t) => t.id))
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(LOGO_KEY) && !known.has(key.slice(LOGO_KEY.length))) stale.push(key)
    }
    for (const t of templates) {
      const data = toRecord(t).logo?.data
      if (data !== undefined) storage.setItem(LOGO_KEY + t.id, data)
    }
    storage.setItem(LIST_KEY, JSON.stringify(templates.map(listEntry)))
    for (const key of stale) storage.removeItem(key)
  }

  /** Commits a new list, putting the old one back when the storage refuses. */
  function commit(next: Template[], previous: Template[]): Failure | null {
    try {
      write(next)
      return null
    } catch {
      try {
        write(previous)
      } catch {
        // Nothing more can be done: the next read drops what does not parse.
      }
      return 'full'
    }
  }

  function add(templates: Template[], input: Omit<Template, 'id'>): Template {
    const name = uniqueName(
      input.name,
      templates.map((t) => t.name),
    )
    return { ...input, name, id: newId() }
  }

  return {
    available: storage !== null,
    list: read,
    save(input) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const name = cleanName(input.name)
      if (name === null) return { ok: false, reason: 'name' }
      // A logo beyond the stored size would be dropped on the next read, so
      // it is refused now, before anything is written.
      if (!parseTemplate(toRecord({ ...input, id: 'check', name }), 'check')) {
        return { ok: false, reason: 'logo' }
      }
      const current = load()
      if (!current) return { ok: false, reason: 'unavailable' }
      if (current.length >= MAX_TEMPLATES) return { ok: false, reason: 'limit' }
      const template = add(current, { ...input, name })
      const failed = commit([...current, template], current)
      return failed ? { ok: false, reason: failed } : { ok: true, value: template }
    },
    rename(id, raw) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const name = cleanName(raw)
      if (name === null) return { ok: false, reason: 'name' }
      const current = load()
      if (!current) return { ok: false, reason: 'unavailable' }
      const target = current.find((t) => t.id === id)
      if (!target) return { ok: false, reason: 'missing' }
      const others = current.filter((t) => t.id !== id)
      const renamed = {
        ...target,
        name: uniqueName(
          name,
          others.map((t) => t.name),
        ),
      }
      const failed = commit(
        current.map((t) => (t.id === id ? renamed : t)),
        current,
      )
      return failed ? { ok: false, reason: failed } : { ok: true, value: renamed }
    },
    remove(id) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      const current = load()
      if (!current) return { ok: false, reason: 'unavailable' }
      if (!current.some((t) => t.id === id)) return { ok: false, reason: 'missing' }
      const failed = commit(
        current.filter((t) => t.id !== id),
        current,
      )
      return failed ? { ok: false, reason: failed } : { ok: true, value: null }
    },
    exportText() {
      return JSON.stringify({ format: FILE_FORMAT, version: 1, templates: read().map(toRecord) })
    },
    importText(text) {
      if (!storage) return { ok: false, reason: 'unavailable' }
      if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'limit' }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return { ok: false, reason: 'format' }
      }
      const file = parsed as { format?: unknown; version?: unknown; templates?: unknown } | null
      if (
        !file ||
        file.format !== FILE_FORMAT ||
        file.version !== 1 ||
        !Array.isArray(file.templates)
      ) {
        return { ok: false, reason: 'format' }
      }
      const current = load()
      if (!current) return { ok: false, reason: 'unavailable' }
      const next = [...current]
      let skipped = 0
      for (const raw of file.templates) {
        if (next.length >= MAX_TEMPLATES) {
          skipped++
          continue
        }
        const template = parseTemplate(raw, newId())
        if (!template) {
          skipped++
          continue
        }
        next.push(add(next, template))
      }
      const added = next.length - current.length
      if (added > 0) {
        const failed = commit(next, current)
        if (failed) return { ok: false, reason: failed }
      }
      return { ok: true, value: { added, skipped } }
    },
  }
}
