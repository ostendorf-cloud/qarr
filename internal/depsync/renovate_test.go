// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package depsync

import (
	"encoding/json"
	"os"
	"regexp"
	"slices"
	"testing"
)

// renovateConfigPath is the repository's Renovate configuration, relative to this package.
const renovateConfigPath = "../../renovate.json"

// miseTomlPath is the repository's tool pin file, relative to this package.
const miseTomlPath = "../../mise.toml"

// renovateConfig holds the parts of renovate.json these checks read.
type renovateConfig struct {
	CustomManagers []struct {
		CustomType         string   `json:"customType"`
		ManagerFilePattern []string `json:"managerFilePatterns"`
		MatchStrings       []string `json:"matchStrings"`
		DepNameTemplate    string   `json:"depNameTemplate"`
		DatasourceTemplate string   `json:"datasourceTemplate"`
	} `json:"customManagers"`
	PackageRules []struct {
		MatchPackageNames []string          `json:"matchPackageNames"`
		MatchManagers     []string          `json:"matchManagers"`
		GroupName         string            `json:"groupName"`
		Constraints       map[string]string `json:"constraints"`
	} `json:"packageRules"`
}

func readRenovateConfig(t *testing.T) renovateConfig {
	t.Helper()

	raw, err := os.ReadFile(renovateConfigPath)
	if err != nil {
		t.Fatalf("read renovate.json: %v", err)
	}

	var cfg renovateConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse renovate.json: %v", err)
	}
	return cfg
}

// misePnpm reads the pnpm pin of mise.toml.
func misePnpm(t *testing.T) string {
	t.Helper()

	mise, err := os.ReadFile(miseTomlPath)
	if err != nil {
		t.Fatalf("read mise.toml: %v", err)
	}
	pin := regexp.MustCompile(`(?m)^pnpm = "([^"]+)"`).FindStringSubmatch(string(mise))
	if pin == nil {
		t.Fatal(`mise.toml has no 'pnpm = "<version>"' line`)
	}
	return pin[1]
}

// TestRenovateGroupsGovueHalves fails when renovate.json no longer puts the Go module and
// the npm package of govue into one group, or when the group's pnpm constraint differs from
// the pin in mise.toml. Without the group Renovate raises the halves in separate pull
// requests, and each fails check:govue-version.
func TestRenovateGroupsGovueHalves(t *testing.T) {
	t.Parallel()

	cfg := readRenovateConfig(t)
	pin := misePnpm(t)

	var groups []string
	for _, rule := range cfg.PackageRules {
		if rule.GroupName == "" {
			continue
		}
		if slices.Contains(rule.MatchPackageNames, goModulePath) &&
			slices.Contains(rule.MatchPackageNames, "ostendorf-cloud/govue") {
			groups = append(groups, rule.GroupName)
			if got := rule.Constraints["pnpm"]; got != pin {
				t.Errorf("constraints.pnpm is %q, mise.toml pins %q: they move together", got, pin)
			}
		}
	}

	if len(groups) != 1 {
		t.Fatalf("want exactly one packageRules group naming both %q and %q, got %d: %v",
			goModulePath, "ostendorf-cloud/govue", len(groups), groups)
	}
}

// TestRenovateGroupsPnpmPins fails when renovate.json has no rule that groups the pnpm pin
// of mise.toml with the constraints.pnpm of the govue rule. Without it a pnpm bump of
// mise.toml arrives alone, and TestRenovateGroupsGovueHalves fails on the stale constraint.
func TestRenovateGroupsPnpmPins(t *testing.T) {
	t.Parallel()

	cfg := readRenovateConfig(t)

	var found int
	for _, rule := range cfg.PackageRules {
		if !slices.Contains(rule.MatchPackageNames, "pnpm") {
			continue
		}
		found++
		for _, manager := range []string{"mise", "renovate-config"} {
			if !slices.Contains(rule.MatchManagers, manager) {
				t.Errorf("pnpm rule matchManagers = %v, want it to include %q", rule.MatchManagers, manager)
			}
		}
		if rule.GroupName != "pnpm" {
			t.Errorf("pnpm rule groupName = %q, want %q", rule.GroupName, "pnpm")
		}
	}

	if found != 1 {
		t.Fatalf("want exactly one packageRules entry matching package pnpm, got %d", found)
	}
}

// TestRenovateManagerReadsGovueSpecifier fails when the custom manager's expression no
// longer extracts the tag from web/package.json's real specifier. Renovate's own npm
// manager skips that specifier ("unversioned-reference") because of the "&path:/web"
// suffix, so this manager is the only way the npm half is ever updated.
func TestRenovateManagerReadsGovueSpecifier(t *testing.T) {
	t.Parallel()

	cfg := readRenovateConfig(t)

	raw, err := os.ReadFile(packageJSONPath)
	if err != nil {
		t.Fatalf("read web/package.json: %v", err)
	}
	wantTag, err := packageJSONGovueTag(t)
	if err != nil {
		t.Fatalf("resolve the tag in web/package.json: %v", err)
	}

	for _, manager := range cfg.CustomManagers {
		if manager.CustomType != "regex" || manager.DepNameTemplate != "ostendorf-cloud/govue" {
			continue
		}
		if manager.DatasourceTemplate != "github-tags" {
			t.Fatalf("datasourceTemplate = %q, want github-tags", manager.DatasourceTemplate)
		}
		if !slices.Contains(manager.ManagerFilePattern, "/^web/package\\.json$/") {
			t.Fatalf("managerFilePatterns = %v, want web/package.json", manager.ManagerFilePattern)
		}
		if len(manager.MatchStrings) != 1 {
			t.Fatalf("want one matchStrings entry, got %d", len(manager.MatchStrings))
		}

		re := regexp.MustCompile(manager.MatchStrings[0])
		group := re.SubexpIndex("currentValue")
		if group < 0 {
			t.Fatalf("matchStrings %q has no named group currentValue", manager.MatchStrings[0])
		}
		match := re.FindSubmatch(raw)
		if match == nil {
			t.Fatalf("matchStrings %q finds nothing in web/package.json", manager.MatchStrings[0])
		}
		got := string(match[group])
		if got != wantTag {
			t.Fatalf("custom manager extracts tag %q, web/package.json pins %q", got, wantTag)
		}
		return
	}

	t.Fatal("renovate.json has no regex custom manager for ostendorf-cloud/govue")
}

// TestRenovateExtendsGovueLockfilePreset fails when renovate.json stops extending the
// shared preset that regenerates web/pnpm-lock.yaml. Without it a govue pull request
// updates package.json and go.mod but leaves the lock file stale.
func TestRenovateExtendsGovueLockfilePreset(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(renovateConfigPath)
	if err != nil {
		t.Fatalf("read renovate.json: %v", err)
	}
	var cfg struct {
		Extends []string `json:"extends"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse renovate.json: %v", err)
	}

	const preset = "github>ostendorf-cloud/workflows:govue-lockfile#v0"
	if !slices.Contains(cfg.Extends, preset) {
		t.Fatalf("renovate.json extends %v, want it to include %q", cfg.Extends, preset)
	}
}
