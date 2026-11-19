// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { createApp } from 'vue'
import { createGovueI18n, localeFromPath, useTheme } from '@ostendorf-cloud/govue'

import { messages } from './i18n/messages'
import { pageFor } from './site'
import './styles.css'

// The theme never varies: this scaffold ships exactly one, still neutral,
// palette. Mode starts at "system", the visitor's own choice only overrides
// it once a toggle exists, matching useTheme's own documented default.
useTheme({ theme: 'qarr' })

// Every page is its own prerendered file under a language prefix. The client
// replaces its markup (createApp, never createSSRApp) and takes the language
// from the address. Without a prefix, the dev server at "/", the language is
// detected as usual.
createApp(pageFor(location.pathname))
  .use(createGovueI18n({ locale: localeFromPath(location.pathname), messages }))
  .mount('#app')
