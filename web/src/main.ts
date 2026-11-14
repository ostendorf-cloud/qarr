// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { createApp } from 'vue'
import { useTheme } from '@ostendorf-cloud/govue'

import App from './App.vue'
import './styles.css'

// The theme never varies: this scaffold ships exactly one, still neutral,
// palette. Mode starts at "system", the visitor's own choice only overrides
// it once a toggle exists, matching useTheme's own documented default.
useTheme({ theme: 'qarr' })

createApp(App).mount('#app')
