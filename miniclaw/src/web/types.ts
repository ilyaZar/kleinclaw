/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */

import { type TimeoutConfig } from "../model/config-model.js";
import { type TimingRecorder } from "../timing-collector.js";

export enum Is {
  CLICKABLE = "CLICKABLE",
  DISPLAYED = "DISPLAYED",
  DISABLED = "DISABLED",
  READONLY = "READONLY",
  SELECTED = "SELECTED",
}

export interface WebElement {
  click?(): Promise<void>;
  fill?(value: string): Promise<void>;
  press?(key: string): Promise<void>;
  pressSequentially?(value: string): Promise<void>;
  sendFile?(file: string): Promise<void>;
  selectOption?(value: string | { label?: string; value?: string }): Promise<string[]>;
  setInputFiles?(files: string | string[]): Promise<void>;
  textContent?(): Promise<string | null>;
  type?(value: string): Promise<void>;
  inputValue?(): Promise<string>;
  isChecked?(): Promise<boolean>;
  isDisabled?(): Promise<boolean>;
  isEditable?(): Promise<boolean>;
  isEnabled?(): Promise<boolean>;
  isVisible?(): Promise<boolean>;
  getAttribute?(name: string): Promise<string | null>;
  evaluate?<T = unknown>(pageFunction: string | ((element: unknown) => T)): Promise<T>;
}

export interface WebLocator extends WebElement {
  first?(): WebLocator;
  count?(): Promise<number>;
  nth?(index: number): WebLocator;
  all?(): Promise<WebElement[]>;
  waitFor?(options?: { state?: "attached" | "visible"; timeout?: number }): Promise<void>;
  locator?(selector: string): WebLocator;
}

export interface WebPage {
  url?: string;
  evaluate?(
    pageFunction: string | ((arg: any) => unknown),
    arg?: unknown,
  ): Promise<unknown>;
  goto?(
    url: string,
    options?: { timeout?: number; waitUntil?: "load" | "domcontentloaded" },
  ): Promise<unknown>;
  locator?(selector: string): WebLocator;
  getByText?(text: string, options?: { exact?: boolean }): WebLocator;
  waitForLoadState?(
    state?: "load" | "domcontentloaded",
    options?: { timeout?: number },
  ): Promise<void>;
  waitForTimeout?(ms: number): Promise<void>;
}

export interface WebControllerOptions {
  defaultTimeout?: number;
  sleepRangeMs?: [number, number];
  randomInt?: (maxExclusive: number) => number;
  sleep?: (ms: number) => Promise<void>;
  timeSource?: () => number;
  timeoutConfig?: TimeoutConfig;
  timingCollector?: TimingRecorder | null;
}

export interface WebRequestOptions {
  timeout?: number;
}

export interface WebResponse {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  content: string;
}
