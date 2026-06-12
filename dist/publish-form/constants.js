/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
export const WANTED_SHIPPING_LABELS = {
    SHIPPING: "Versand möglich",
    PICKUP: "Nur Abholung",
};
export const CONDITION_TRIGGER_XPATH = "//label[contains(@for, '.condition')]/following::button" +
    "[@aria-haspopup='dialog' or @aria-haspopup='true'][1]";
export const CATEGORY_CHANGE_CONTROL_XPATH = "//a[contains(., 'Kategorie')] | //button[contains(., 'Kategorie')]";
export const CATEGORY_NEXT_BUTTON_XPATH = "//button[contains(., 'Weiter')]";
export const CATEGORY_PICKER_RADIO_SELECTOR = "#ad-category-picker input[type='radio'][name='category-suggestions']";
export const CITY_LISTBOX_ID_FALLBACK = "ad-city-menu";
export const CITY_SELECTED_OPTION_ID = "ad-city-selected-option";
export const SHIPPING_OTHER_METHODS_BUTTON_XPATH = '//button[contains(., "Andere Versandmethoden")]';
export const SHIPPING_BACK_BUTTON_XPATH = '//button[contains(., "Zurück")]';
export const SHIPPING_DONE_BUTTON_XPATH = '//button[contains(., "Fertig")]';
export const SHIPPING_DIALOG_XPATH = '//*[self::dialog or @role="dialog"]';
export const SHIPPING_DIALOG_DONE_BUTTON_XPATH = `${SHIPPING_DIALOG_XPATH}//button[contains(., "Fertig")]`;
export const SHIPPING_DIALOG_NEXT_BUTTON_XPATH = `${SHIPPING_DIALOG_XPATH}//button[contains(., "Weiter")]`;
export const IMAGE_FILE_INPUT_SELECTOR = "input[type=file]";
export const IMAGE_MARKER_SELECTOR = "input[name^='adImages'][name$='.url']";
export const IMAGE_REMOVE_BUTTON_SELECTOR = "button[aria-label='Bild entfernen']";
export const CAPTCHA_IFRAME_SELECTOR = "iframe[name^='a-'][src^='https://www.google.com/recaptcha/api2/anchor?']";
export const SUBMIT_BUTTON_XPATH = "//button[contains(., 'Anzeige aufgeben') or " +
    "contains(., 'Änderungen speichern') or contains(., 'Anzeige speichern')]";
export const IMPRINT_GUIDANCE_SUBMIT_ID = "imprint-guidance-submit";
export const NO_IMAGE_HINT_BUTTON_XPATH = '//button[contains(., "Ohne Bild veröffentlichen")]';
export const VISIBILITY_UPSELL_SKIP_BUTTON_XPATH = '//button[contains(., "Ohne Hochschieben weiter")]';
export const PAYMENT_FORM_ID = "myftr-shppngcrt-frm";
export const CONFIRMATION_URL_FRAGMENT = "p-anzeige-aufgeben-bestaetigung.html?adId=";
export const TRACKING_SCRIPT_TEXT_JS = "[...document.querySelectorAll('script')].map(s => s.textContent).join('\\n')";
export const CONDITION_GERMAN_TO_API = {
    neu: "new",
    wie_neu: "like_new",
    sehr_gut: "like_new",
    gut: "ok",
    in_ordnung: "alright",
    defekt: "defect",
};
