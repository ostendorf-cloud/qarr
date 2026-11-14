// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Package config loads and validates qarr's own environment in one pass,
// collecting every problem into one error so a misconfigured deployment
// reports all of its mistakes at once instead of one per restart.
package config

import (
	"errors"
	"fmt"
)

// Config is every setting qarr reads from the environment.
type Config struct {
	// Addr is the public listener's address: the embedded SPA.
	Addr string
	// AdminAddr is govue's admin listener's address: health, readiness and
	// metrics, never reached through this app's own Ingress.
	AdminAddr string
	// LogLevel is one of "debug", "info", "warn" or "error".
	LogLevel string
}

// validLogLevels are the values LogLevel accepts.
var validLogLevels = map[string]bool{
	"debug": true,
	"info":  true,
	"warn":  true,
	"error": true,
}

// Load reads every setting from the environment through getenv, so a test
// can pass a fake instead of the real process environment. Every field has a
// documented default; Load returns every validation problem at once rather
// than stopping at the first one.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:      valueOrDefault(getenv("ADDR"), ":8080"),
		AdminAddr: valueOrDefault(getenv("ADMIN_ADDR"), ":8081"),
		LogLevel:  valueOrDefault(getenv("LOG_LEVEL"), "info"),
	}

	var problems []error
	if !validLogLevels[cfg.LogLevel] {
		problems = append(problems, fmt.Errorf("LOG_LEVEL: %q is not one of debug, info, warn, error", cfg.LogLevel))
	}

	if err := errors.Join(problems...); err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	return cfg, nil
}

// valueOrDefault returns value unless it is empty, in which case it returns
// def.
func valueOrDefault(value, def string) string {
	if value == "" {
		return def
	}
	return value
}
