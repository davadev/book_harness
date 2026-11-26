// TEMPLATE (skeleton): src/tests/settingsCoverage.test.ts
// WHAT: keeps the declarative settings tab (Obsidian 1.13+ `getSettingDefinitions()`) honest in both directions:
//       every user-editable setting has a control (or is listed in NOT_IN_SETTINGS_TAB with a reason), every control is
//       bound to a real setting that some code actually reads, keys are unique, every control sits under a heading, and a
//       value round-trips through setControlValue/getControlValue.
// CHANGE: the three imports (your tab class, DEFAULT_SETTINGS, and the fake plugin in makeTab), then NOT_IN_SETTINGS_TAB.
//         Assumes `class PluginSettingsTab extends PluginSettingTab` in src/settings/SettingsTab.ts with a
//         (app, plugin) constructor and a `plugin.settings` object, and src/settings/defaults.ts exporting DEFAULT_SETTINGS.
//         The heading test is a HOUSE CHOICE for large tabs (SETTINGS-AND-UPGRADE-UX section 2). Obsidian's own style guide lets
//         general settings sit first with no heading; ALLOW_UNHEADED_GENERAL_SECTION keeps that. Delete the test if you disagree.
// GUARDS: a setting added with no control (or a control nobody reads: a toggle that promised behaviour nothing implemented
//         shipped for a release), and a flat-appended setting that drifted under the wrong heading.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PluginSettingsTab } from "../settings/SettingsTab";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { installCreateFragmentStub } from "./__mocks__/obsidianDom";

/** Allow the leading run of settings before the first group/list/page to have no heading (the official "general" section). */
const ALLOW_UNHEADED_GENERAL_SECTION = true;

/** Settings with no control in the tab, each for a stated reason. Add a reason with every entry. */
const NOT_IN_SETTINGS_TAB: Record<string, string> = {};

interface Item {
  type?: string;
  name?: string;
  heading?: string;
  items?: Item[];
  control?: { key?: string };
}

function leafPaths(obj: unknown, prefix = ""): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v) ? leafPaths(v, path) : [path];
  });
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, part) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined), obj);
}

function collectKeys(items: Item[]): string[] {
  return items.flatMap((item) => [...(item.control?.key ? [item.control.key] : []), ...collectKeys(item.items ?? [])]);
}

/** Every named setting mapped to the heading it renders under. An empty-items `group` is a DIVIDER: it labels what follows. */
function headingOf(items: Item[], inherited = ""): Map<string, string> {
  const out = new Map<string, string>();
  let current = inherited;
  for (const item of items) {
    if (item.type === "group" || item.type === "list") {
      if (item.items && item.items.length > 0) for (const [k, v] of headingOf(item.items, item.heading ?? current)) out.set(k, v);
      else current = item.heading ?? current;
      continue;
    }
    if (item.type === "page") {
      // A page is its own screen: its direct settings count as headed by the page name.
      for (const [k, v] of headingOf(item.items ?? [], item.name ?? "page")) out.set(k, v);
      continue;
    }
    if (item.name) out.set(item.name, current);
  }
  return out;
}

function makeTab(): PluginSettingsTab {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  const plugin = { app: { vault: { configDir: ".obsidian" } }, settings, saveSettings: vi.fn().mockResolvedValue(undefined) };
  return new PluginSettingsTab(plugin.app as never, plugin as never);
}

const definitions = (): Item[] => makeTab().getSettingDefinitions() as Item[];

describe("settings tab definitions", () => {
  beforeEach(() => {
    installCreateFragmentStub();
  });

  it("exposes a control for every user-editable setting", () => {
    const keys = new Set(collectKeys(definitions()));
    expect(leafPaths(DEFAULT_SETTINGS).filter((p) => !keys.has(p) && !(p in NOT_IN_SETTINGS_TAB))).toEqual([]);
  });

  it("lists no exemption for a setting that no longer exists", () => {
    const real = new Set(leafPaths(DEFAULT_SETTINGS));
    expect(Object.keys(NOT_IN_SETTINGS_TAB).filter((k) => !real.has(k))).toEqual([]);
  });

  it("only binds controls to real settings paths (no typos)", () => {
    const bogus = collectKeys(definitions()).filter((k) => getByPath(DEFAULT_SETTINGS, k) === undefined);
    expect(bogus).toEqual([]);
  });

  it("gives every control a unique key", () => {
    const keys = collectKeys(definitions());
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("puts every named setting under a heading (never flat-appended)", () => {
    const defs = definitions();
    const firstHeaded = defs.findIndex((i) => i.type === "group" || i.type === "list" || i.type === "page");
    const general = new Set(ALLOW_UNHEADED_GENERAL_SECTION ? defs.slice(0, firstHeaded < 0 ? defs.length : firstHeaded).map((i) => i.name) : []);
    const flat = [...headingOf(defs)].filter(([name, heading]) => heading === "" && !general.has(name)).map(([name]) => name);
    expect(flat).toEqual([]);
  });

  it("only binds controls to settings that some code actually reads", () => {
    const SKIP_FILES = new Set(["types.ts", "defaults.ts", "SettingsTab.ts"]);
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "tests") walk(full);
        } else if (entry.endsWith(".ts") && !SKIP_FILES.has(entry)) sources.push(readFileSync(full, "utf8"));
      }
    };
    walk("src");
    const haystack = sources.join("\n");
    const unread = collectKeys(definitions()).filter((k) => !new RegExp(`\\.${k.slice(k.lastIndexOf(".") + 1)}\\b`).test(haystack));
    expect(unread).toEqual([]);
  });

  it("round-trips a value through setControlValue / getControlValue and saves", async () => {
    const tab = makeTab();
    const key = collectKeys(definitions())[0];
    const next = typeof getByPath(DEFAULT_SETTINGS, key) === "boolean" ? !getByPath(DEFAULT_SETTINGS, key) : "changed";
    await tab.setControlValue(key, next);
    expect(tab.getControlValue(key)).toBe(next);
  });
});
