/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import assert from "node:assert";

import {
  ControllerFinding,
  type FirstAvailableOptions,
} from "./controller-finding.js";
import { requirePageMethod } from "./controller-support.js";
import { By, type WebSelector } from "./selector.js";
import { Is, type WebElement, type WebLocator } from "./types.js";

// Selection-based visible text is empty for unrendered subtrees (e.g. a header
// hidden below 768px viewport width); textContent still carries the text.
type FirstAvailableTextOptions = FirstAvailableOptions & {
  fallbackToTextContent?: boolean;
};

export class ControllerElementInteraction extends ControllerFinding {
  async webTextFirstAvailable(
    selectors: readonly WebSelector[],
    {
      description,
      fallbackToTextContent = false,
      key = "default",
      parent = null,
      timeout,
    }: FirstAvailableTextOptions = {},
  ): Promise<[string, number]> {
    const [element, index] = await this.webFindFirstAvailable(selectors, {
      description,
      key,
      parent,
      timeout,
    });
    return [await this.textOf(element, fallbackToTextContent), index];
  }

  async webTextFirstAvailableOnce(
    selectors: readonly WebSelector[],
    {
      description,
      fallbackToTextContent = false,
      key = "default",
      parent = null,
      timeout,
    }: FirstAvailableTextOptions = {},
  ): Promise<[string, number]> {
    const [element, index] = await this.webFindFirstAvailableOnce(selectors, {
      description,
      key,
      parent,
      timeout,
    });
    return [await this.textOf(element, fallbackToTextContent), index];
  }

  async webCheck(type: By, value: string, attr: Is, timeout?: number): Promise<boolean> {
    const element = await this.webFind(type, value, { timeout });
    switch (attr) {
      case Is.CLICKABLE:
        return !(await this.isDisabled(element)) || await this.isDisplayed(element);
      case Is.DISPLAYED:
        return this.isDisplayed(element);
      case Is.DISABLED:
        return this.isDisabled(element);
      case Is.READONLY:
        return element.getAttribute
          ? (await element.getAttribute("readonly")) !== null
          : false;
      case Is.SELECTED:
        return this.isSelected(element);
    }
    throw new assert.AssertionError({
      message: `Unsupported attribute: ${String(attr)}`,
    });
  }

  async webClick(type: By, value: string, timeout?: number): Promise<WebLocator> {
    const element = await this.webFind(type, value, { timeout });
    await requirePageMethod(element.click, "element.click").call(element);
    await this.webSleep();
    return element;
  }

  async clearInput(element: WebElement): Promise<void> {
    if (element.evaluate && element.press) {
      await element.evaluate("(elem) => { elem.focus(); elem.select(); }");
      await this.webSleep(50, 100);
      await element.press("Backspace");
      return;
    }
    if (element.fill) {
      await element.fill("");
      return;
    }
    if (element.evaluate) {
      await element.evaluate(`
        function (element) {
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `);
      return;
    }
    throw new Error("Element does not support clearing input");
  }

  async dispatchArrowDownAndEnter(element: WebElement): Promise<void> {
    if (element.evaluate) {
      await element.evaluate("(elem) => elem.focus()");
    }
    const press = requirePageMethod(element.press, "element.press");
    await this.webSleep(300, 600);
    await press.call(element, "ArrowDown");
    await this.webSleep(200, 400);
    await press.call(element, "Enter");
  }

  async webInput(
    type: By,
    value: string,
    text: string | number,
    timeout?: number,
  ): Promise<WebLocator> {
    const element = await this.webFind(type, value, { timeout });
    await this.clearInput(element);
    await this.inputText(element, String(text));
    await this.webSleep();
    return element;
  }

  async webText(
    type: By,
    value: string,
    {
      parent = null,
      timeout,
    }: {
      parent?: WebLocator | null;
      timeout?: number;
    } = {},
  ): Promise<string> {
    const element = await this.webFind(type, value, { parent, timeout });
    return this.extractVisibleText(element);
  }

  private async textOf(element: WebElement, fallbackToTextContent: boolean): Promise<string> {
    const visible = await this.extractVisibleText(element);
    if (visible || !fallbackToTextContent || !element.textContent) {
      return visible;
    }
    return ((await element.textContent()) ?? "").replace(/\s+/g, " ").trim();
  }

  async extractVisibleText(element: WebElement): Promise<string> {
    if (element.evaluate) {
      const text = await element.evaluate(`
        function (elem) {
          let sel = window.getSelection();
          sel.removeAllRanges();
          let range = document.createRange();
          range.selectNode(elem);
          sel.addRange(range);
          let visibleText = sel.toString().trim();
          sel.removeAllRanges();
          return visibleText;
        }
      `);
      return String(text ?? "");
    }
    if (element.textContent) {
      return (await element.textContent())?.trim() ?? "";
    }
    throw new Error("Element does not support text extraction");
  }

  protected async inputText(element: WebElement, text: string): Promise<void> {
    if (element.pressSequentially) {
      await element.pressSequentially(text);
    } else if (element.type) {
      await element.type(text);
    } else if (element.fill) {
      await element.fill(text);
    } else {
      throw new Error("Element does not support text input");
    }
  }

  private async isDisabled(element: WebElement): Promise<boolean> {
    if (element.isDisabled) {
      return element.isDisabled();
    }
    return element.getAttribute
      ? (await element.getAttribute("disabled")) !== null
      : false;
  }

  private async isDisplayed(element: WebElement): Promise<boolean> {
    if (element.isVisible) {
      return element.isVisible();
    }
    if (element.evaluate) {
      return Boolean(await element.evaluate(`
        function (element) {
          var style = window.getComputedStyle(element);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0'
            && element.offsetWidth > 0
            && element.offsetHeight > 0
        }
      `));
    }
    return true;
  }

  private async isSelected(element: WebElement): Promise<boolean> {
    if (element.evaluate) {
      return Boolean(await element.evaluate(`
        function (element) {
          if (element.tagName.toLowerCase() === 'input') {
            if (element.type === 'checkbox' || element.type === 'radio') {
              return element.checked
            }
          }
          return false
        }
      `));
    }
    return element.isChecked ? element.isChecked() : false;
  }
}
