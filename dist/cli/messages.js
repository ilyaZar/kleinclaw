export function noAdsMessage(command) {
    switch (command) {
        case "publish":
            return "DONE: No new/outdated ads found.";
        case "update":
            return "DONE: No changed ads found.";
        case "delete":
            return "DONE: No ads to delete found.";
        case "extend":
            return "DONE: No ads found to extend.";
        case "update-content-hash":
            return "DONE: No active ads found.";
        default:
            return null;
    }
}
export function printDoneBlock(message) {
    console.error("############################################");
    console.error(message);
    console.error("############################################");
}
export function printDiagnosticLine(status, message) {
    if (message.startsWith("===") || message.startsWith("  ")) {
        console.error(message);
        return;
    }
    console.error(`(${status}) ${message}`);
}
export function browserCommandMessage(plan) {
    if (plan.command === "download") {
        return ("download requires browser automation; rerun with " +
            "--allow-live-browser after confirming the account side effect.");
    }
    const count = plan.selectedCount ?? plan.selectedAds.length;
    const plural = count === 1 ? "ad" : "ads";
    return (`${plan.command} selected ${count} ${plural}, ` +
        "but browser automation is gated. Rerun with --allow-live-browser " +
        "after confirming the account side effect.");
}
function pluralizedAds(count) {
    return `${count} ${count === 1 ? "ad" : "ads"}`;
}
export function sideEffectDoneMessage(command, succeeded, failed) {
    if (command === "publish") {
        const message = `DONE: (Re-)published ${pluralizedAds(succeeded)}`;
        return failed > 0
            ? `${message} (${failed} failed after retries)`
            : message;
    }
    if (command === "update") {
        const message = `DONE: Updated ${pluralizedAds(succeeded)}`;
        return failed > 0
            ? `${message} (${failed} failed after retries)`
            : message;
    }
    return `DONE: Processed ${pluralizedAds(succeeded)}`;
}
export function deleteDoneMessage(deleted, processed) {
    return `DONE: Deleted ${deleted} of ${pluralizedAds(processed)}`;
}
export function extendDoneMessage(extended, attempted) {
    if (attempted === 0) {
        return "DONE: No ads extended.";
    }
    return `DONE: Extended ${pluralizedAds(extended)}`;
}
export function downloadDoneMessage(selector, downloaded, targetCount) {
    if (selector === "new") {
        return `DONE: Downloaded ${pluralizedAds(downloaded)}`;
    }
    return `DONE: Downloaded ${downloaded} of ${pluralizedAds(targetCount)}`;
}
