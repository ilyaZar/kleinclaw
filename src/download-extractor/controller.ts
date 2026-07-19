import {
  type By,
  type WebElement,
  type WebLocator,
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
