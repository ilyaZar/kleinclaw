import {
  type By,
  type WebLocator,
  type WebElement,
  type WebRequestOptions,
  type WebResponse,
} from "../web-primitives.js";

export interface WebReadController {
  webFind(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebLocator>;
  webFindAll(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebElement[]>;
  // single quick lookup without retries; lets island data replace classic
  // markup that redesigned pages lack
  webProbe?(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<WebLocator | null>;
  webRequest(
    url: string,
    method?: string,
    validResponseCodes?: number | Iterable<number>,
    headers?: Record<string, string> | null,
    options?: WebRequestOptions,
  ): Promise<WebResponse>;
  webText(
    type: By,
    value: string,
    options?: { parent?: WebLocator | WebElement | null; timeout?: number },
  ): Promise<string>;
}
