/*
 * SPDX-FileCopyrightText: © Sebastian Thomschke and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { By, TimeoutError } from "../web-primitives.js";
import { callPageScript, EXTEND_CHOICE_DIALOG_SCRIPT, } from "../web/page-scripts.js";
import { navigatePaginatedAdOverview, } from "./publish-side-effects-ad-overview.js";
// The paid option ("Verlängern & Hochschieben für 2,99 €") must never be
// selected; the page script matches the free option by value or this label.
const FREE_OPTION_TEXT = "Nur verlängern";
const CONFIRM_BUTTON_TEXT = "Anzeige verlängern";
const SUCCESS_TEXT = "erfolgreich verlängert";
const CLASSIC_SUCCESS_TEXT = "Vielen Dank";
function choiceDialogScript(action) {
    return callPageScript(EXTEND_CHOICE_DIALOG_SCRIPT, action, FREE_OPTION_TEXT, CONFIRM_BUTTON_TEXT, SUCCESS_TEXT, CLASSIC_SUCCESS_TEXT);
}
async function awaitDialogState(controller, wanted, timeout) {
    try {
        return await controller.webAwait(async () => {
            const state = String(await controller.webExecute(choiceDialogScript("state")));
            return wanted.includes(state) ? state : null;
        }, {
            timeout,
            timeoutErrorMessage: `Extension dialog state did not become ${wanted.join("|")}`,
        });
    }
    catch (error) {
        if (error instanceof TimeoutError) {
            return null;
        }
        throw error;
    }
}
// Every step re-checks that exactly the free option is selected; a dialog
// that merely closes is not a success.
async function confirmFreeExtension(controller, confirmationTimeout) {
    if (String(await controller.webExecute(choiceDialogScript("select"))) !== "selected") {
        return false;
    }
    await controller.webSleep();
    if (String(await controller.webExecute(choiceDialogScript("confirm"))) !== "clicked") {
        return false;
    }
    return await awaitDialogState(controller, ["success"], confirmationTimeout) === "success";
}
async function closeOpenDialog(controller, quickDomTimeout) {
    try {
        await controller.webClick(By.CSS_SELECTOR, 'button[aria-label="Schließen"]', quickDomTimeout);
    }
    catch (error) {
        if (!(error instanceof TimeoutError)) {
            throw error;
        }
    }
}
export async function extendPublishedAd(controller, rootUrl, context, { confirmationTimeout, paginationFollowUpTimeout, paginationInitialTimeout, quickDomTimeout, } = {}) {
    if (!context.ad.id) {
        return false;
    }
    const extendButtonXPath = `//li[@data-adid="${context.ad.id}"]//button[contains(., "Verlängern")]`;
    let clicked = false;
    await navigatePaginatedAdOverview(controller, `${rootUrl}/m-meine-anzeigen.html`, async () => {
        let extendButton;
        try {
            extendButton = await controller.webFind(By.XPATH, extendButtonXPath, { timeout: quickDomTimeout });
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return false;
            }
            throw error;
        }
        if (!extendButton.click) {
            return false;
        }
        // A success toast from a previous extension would be taken for this one.
        if (!await awaitDialogState(controller, ["none"], confirmationTimeout)) {
            return true;
        }
        await extendButton.click();
        clicked = true;
        return true;
    }, {
        paginationFollowUpTimeout,
        paginationInitialTimeout,
    });
    if (!clicked) {
        return false;
    }
    // Since the Astro redesign "Verlängern" opens a choice dialog; the classic
    // flow extends directly and shows a "Vielen Dank!" dialog.
    const state = await awaitDialogState(controller, ["choice", "success"], confirmationTimeout);
    const extended = state === "success" ||
        (state === "choice" &&
            await confirmFreeExtension(controller, confirmationTimeout));
    await closeOpenDialog(controller, quickDomTimeout);
    return extended;
}
