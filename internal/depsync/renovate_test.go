// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package depsync

import (
	"encoding/json"
	"os"
	"regexp"
	"slices"
	"strings"
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
		AllowedVersions   string            `json:"allowedVersions"`
		Description       string            `json:"description"`
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
		for _, manager := range []string{"mise", "custom.regex", "renovate-config"} {
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

// TestRenovateHoldsTypescriptBelowSeven fails when renovate.json has no rule that keeps
// typescript below 7, when that range changes, or when the rule loses its description. The
// hold exists because typescript-eslint and vue-tsc do not support 7 yet. The description
// is the only place that names when to remove the rule.
func TestRenovateHoldsTypescriptBelowSeven(t *testing.T) {
	t.Parallel()

	cfg := readRenovateConfig(t)

	var found int
	for _, rule := range cfg.PackageRules {
		if !slices.Contains(rule.MatchPackageNames, "typescript") {
			continue
		}
		found++
		if rule.AllowedVersions != "<7" {
			t.Errorf("typescript rule allowedVersions = %q, want %q", rule.AllowedVersions, "<7")
		}
		if !strings.Contains(rule.Description, "Remove this rule when") {
			t.Errorf("typescript rule description = %q, want it to name the condition to remove the rule", rule.Description)
		}
	}

	if found != 1 {
		t.Fatalf("want exactly one packageRules entry matching package typescript, got %d", found)
	}
}

// dockerfilePath is the repository's Dockerfile, relative to this package.
const dockerfilePath = "../../Dockerfile"

var (
	// dockerfilePnpm is the version argument Renovate updates. dockerfileCorepack is the
	// one install line, which must take that argument and no literal.
	dockerfilePnpm     = regexp.MustCompile(`(?m)^ARG PNPM_VERSION=(\S+)$`)
	dockerfileCorepack = regexp.MustCompile(`corepack prepare (\S+) --activate`)
)

// TestDockerfilePnpmMatchesMise fails when the Dockerfile's frontend stage installs a
// different pnpm than mise.toml pins. The lockfile the image reads with --frozen-lockfile
// has to come from the same pnpm a local install uses.
func TestDockerfilePnpmMatchesMise(t *testing.T) {
	t.Parallel()

	docker, err := os.ReadFile(dockerfilePath)
	if err != nil {
		t.Fatalf("read Dockerfile: %v", err)
	}
	pin := misePnpm(t)

	arg := dockerfilePnpm.FindStringSubmatch(string(docker))
	if arg == nil {
		t.Fatal("Dockerfile has no 'ARG PNPM_VERSION=<version>' line")
	}
	installs := dockerfileCorepack.FindAllStringSubmatch(string(docker), -1)
	if len(installs) != 1 || installs[0][1] != `"pnpm@${PNPM_VERSION}"` {
		t.Fatalf(`Dockerfile must install pnpm once, as corepack prepare "pnpm@${PNPM_VERSION}" --activate, got %q`, installs)
	}
	if arg[1] != pin {
		t.Fatalf("Dockerfile installs pnpm %s but mise.toml pins pnpm %s: they must match", arg[1], pin)
	}
}

// TestRenovateReadsTheDockerfilePnpm fails when no regex custom manager of renovate.json
// extracts the npm datasource, the depName pnpm and the mise.toml version from the
// Dockerfile's PNPM_VERSION argument. Renovate's Dockerfile manager does not read an ARG.
// Renovate's named group syntax, (?<name>...), is also Go's.
func TestRenovateReadsTheDockerfilePnpm(t *testing.T) {
	t.Parallel()

	docker, err := os.ReadFile(dockerfilePath)
	if err != nil {
		t.Fatalf("read Dockerfile: %v", err)
	}
	pin := misePnpm(t)

	found := false
	for _, manager := range readRenovateConfig(t).CustomManagers {
		if manager.CustomType != "regex" || !slices.Contains(manager.ManagerFilePattern, "/^Dockerfile$/") {
			continue
		}
		for _, expr := range manager.MatchStrings {
			re, err := regexp.Compile(expr)
			if err != nil {
				t.Fatalf("matchStrings %q does not compile: %v", expr, err)
			}
			match := re.FindStringSubmatch(string(docker))
			if match == nil {
				continue
			}
			named := map[string]string{}
			for i, name := range re.SubexpNames() {
				if name != "" {
					named[name] = match[i]
				}
			}
			if named["datasource"] != "npm" || named["depName"] != "pnpm" || named["currentValue"] != pin {
				t.Errorf("the Dockerfile manager extracts %v, want datasource npm, depName pnpm, version %s", named, pin)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("no regex manager of renovate.json matches the Dockerfile's PNPM_VERSION argument")
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
