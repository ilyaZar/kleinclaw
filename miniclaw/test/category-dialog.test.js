// Category tree shapes and dialog markup follow the redesigned post-ad page
// (cases ported from kleinanzeigen-bot tests, AGPL-3.0-or-later).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import {
  categoryDialogLabelOptions,
  categoryLabelMatchScore,
  setCategoryInDialog,
  siteCategoryLabels,
} from "../dist/publish-form/publish-form-category-dialog.js";
import { setCategory } from "../dist/publish-form/publish-form-category-selection.js";
import { By, TimeoutError } from "../dist/web-primitives.js";

const TREE = [
  {
    id: 161,
    name: "Elektronik",
    children: [
      { id: 173, name: "Handy & Telefon", children: [] },
      { id: 227, name: "Videospiele", children: [] },
    ],
  },
  { id: 17, name: "Familie, Kind & Baby", children: [{ id: 23, name: "Spielzeug", children: [] }] },
];

const BUNDLED = {
  "Elektronik > Handy & Telefon": "161/173",
  "Elektronik > Videospiele": "161/227",
  "Familie, Kind & Baby > Spielzeug": "17/23",
};

// Minimal devalue encoder: index 0 is the root, containers hold indices.
function devalue(root) {
  const flat = [];
  const add = (value) => {
    const index = flat.length;
    flat.push(null);
    if (Array.isArray(value)) {
      flat[index] = value.map(add);
    } else if (value !== null && typeof value === "object") {
      flat[index] = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, add(item)]));
    } else {
      flat[index] = value;
    }
    return index;
  };
  add(root);
  return flat;
}

// A dialog that renders one level at a time, like "Kategorie wählen".
function categoryPage({ levels, rootEntry = false, needsMoreAt = null, tree = TREE } = {}) {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { runScripts: "outside-only" });
  const { document } = dom.window;
  dom.window.Element.prototype.getClientRects = function getClientRects() {
    return this.closest("[hidden]") ? [] : [{}];
  };
  if (tree) {
    dom.window.fetch = async (url) => {
      const action = String(url).match(/categoryTree\.(\w+)/)[1];
      const data = action === "getTree" ? tree : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(devalue(data)) };
    };
  }

  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  dialog.innerHTML = "<h2>Kategorie wählen</h2><ul></ul><button type='button'>Übernehmen</button>";
  document.body.append(dialog);
  const list = dialog.querySelector("ul");
  const clicks = [];

  const render = (labels, depth) => {
    list.innerHTML = "";
    for (const label of labels) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.innerHTML = `${label}<span class="sr-only">, öffnet Unterkategorien</span>`;
      button.addEventListener("click", () => {
        clicks.push(label);
        if (label === "Alle Kategorien") {
          render(levels[0], 0);
        } else if (depth + 1 < levels.length && depth !== needsMoreAt) {
          render(levels[depth + 1], depth + 1);
        } else if (depth === needsMoreAt) {
          render(["PlayStation 4", "PlayStation 5"], depth + 1);
        } else {
          button.setAttribute("aria-pressed", "true");
        }
      });
      item.append(button);
      list.append(item);
    }
  };
  render(rootEntry ? ["Alle Kategorien"] : levels[0], 0);
  dialog.querySelector("button:not(li button)").addEventListener("click", () => {
    clicks.push("apply");
    dialog.remove();
  });

  const controller = {
    async webExecute(js) {
      return dom.window.eval(js);
    },
    async webSleep() {},
  };
  return { clicks, controller, document };
}

describe("miniclaw category labels", () => {
  it("matches labels across umlauts, punctuation, and 'und'", () => {
    assert.equal(categoryLabelMatchScore("Familie, Kind & Baby", "Familie Kind und Baby"), 3);
    assert.equal(categoryLabelMatchScore("Handy & Telefon", "Handy"), 2);
    assert.equal(categoryLabelMatchScore("Größe", "groesse"), 3);
    assert.equal(categoryLabelMatchScore("Videospiele", "Handy"), 0);
  });

  it("derives per-level candidates from bundled names", () => {
    assert.deepEqual(categoryDialogLabelOptions("161/173", BUNDLED), [["Elektronik"], ["Handy & Telefon"]]);
    const other = categoryDialogLabelOptions("161/sonstiges", BUNDLED)[1];
    assert.ok(other.includes("Sonstiges"));
    assert.ok(other.includes("Andere Elektronik"));
    assert.deepEqual(
      categoryDialogLabelOptions("153/158/pullover_strickjacken", {}, "Strickjacke Wolle").at(-1),
      ["Strickjacken", "pullover strickjacken"],
    );
  });

  it("reads the site's labels from the category tree", async () => {
    const { controller } = categoryPage({ levels: [["Elektronik"]] });
    const labels = await siteCategoryLabels(controller, "161/173");
    assert.deepEqual([...labels], [[0, "Elektronik"], [1, "Handy & Telefon"]]);
  });
});

describe("miniclaw category dialog", () => {
  it("selects each level, checks the pressed leaf, and applies", async () => {
    const page = categoryPage({
      levels: [["Elektronik", "Familie, Kind & Baby"], ["Handy & Telefon", "Videospiele"]],
    });

    await setCategoryInDialog(page.controller, "161/173", {});

    assert.deepEqual(page.clicks, ["Elektronik", "Handy & Telefon", "apply"]);
    assert.equal(page.document.querySelector("dialog"), null);
  });

  it("falls back to bundled names when the site data is unavailable", async () => {
    const page = categoryPage({
      levels: [["Elektronik", "Familie, Kind & Baby"], ["Handy & Telefon", "Videospiele"]],
      tree: null,
    });

    await setCategoryInDialog(page.controller, "161/227", BUNDLED);

    assert.deepEqual(page.clicks, ["Elektronik", "Videospiele", "apply"]);
  });

  it("opens a generic 'Alle Kategorien' entry point first", async () => {
    const page = categoryPage({
      levels: [["Elektronik", "Familie, Kind & Baby"], ["Spielzeug"]],
      rootEntry: true,
    });

    await setCategoryInDialog(page.controller, "17/23", {});

    assert.deepEqual(page.clicks, ["Alle Kategorien", "Familie, Kind & Baby", "Spielzeug", "apply"]);
  });

  it("names the offered choices when a level has no unique match", async () => {
    const page = categoryPage({ levels: [["Auto, Rad & Boot", "Haus & Garten"]], tree: null });

    await assert.rejects(
      setCategoryInDialog(page.controller, "161/173", BUNDLED),
      /no unique match .* Offered choices: Auto, Rad & Boot, Haus & Garten/,
    );
    assert.deepEqual(page.clicks, []);
  });

  it("refuses to apply when the site asks for one more level", async () => {
    const page = categoryPage({
      levels: [["Elektronik"], ["Videospiele"]],
      needsMoreAt: 1,
    });

    await assert.rejects(
      setCategoryInDialog(page.controller, "161/227", {}),
      /did not select the requested leaf 'Videospiele'.*PlayStation 4, PlayStation 5/,
    );
    assert.equal(page.clicks.includes("apply"), false);
  });
});

describe("miniclaw classic category picker", () => {
  it("clicks each path segment without reloading the category page", async () => {
    const events = [];
    const controller = {
      async webClick(type, value) {
        events.push(`click:${value}`);
      },
      async webExecute(js) {
        assert.match(js, /Kategorie wählen/);
        return false;
      },
      async webFind() {
        throw new TimeoutError("not needed");
      },
      async webFindAll() {
        return [];
      },
      async webProbe(type, value) {
        if (type === By.CSS_SELECTOR && value === 'a[aria-describedby="ad-category-path"]') {
          return { click: async () => events.push("click:category-link") };
        }
        return null;
      },
      async webSleep() {},
    };

    await setCategory(controller, { adFile: "ad.yaml", category: "161/173" });

    assert.deepEqual(events, [
      "click:ad-description",
      "click:category-link",
      "click:cat_161",
      "click:cat_173",
      "click://button[contains(., 'Weiter')]",
    ]);
  });
});
