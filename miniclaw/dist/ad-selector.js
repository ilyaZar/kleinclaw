export const NUMERIC_IDS_RE = /^\d+(,\d+)*$/;
export function isNumericIdSelector(selector) {
    return NUMERIC_IDS_RE.test(selector);
}
