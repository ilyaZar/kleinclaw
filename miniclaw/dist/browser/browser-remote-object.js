/*
 * SPDX-FileCopyrightText: © Jens Bergmann and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-ArtifactOfProjectHomePage: https://github.com/Second-Hand-Friends/kleinanzeigen-bot/
 */
import { isRecord } from "../value-guards.js";
const KEY_VALUE_PAIR_SIZE = 2;
export function isRemoteObjectLike(value) {
    if (!isRecord(value)) {
        return false;
    }
    const constructorName = value.constructor?.name ?? "";
    return constructorName.includes("RemoteObject");
}
export function convertRemoteObjectValue(data) {
    if (Array.isArray(data)) {
        if (data.length > 0 &&
            Array.isArray(data[0]) &&
            data[0].length === KEY_VALUE_PAIR_SIZE) {
            const converted = {};
            for (const item of data) {
                if (!Array.isArray(item) || item.length !== KEY_VALUE_PAIR_SIZE) {
                    continue;
                }
                const [key, value] = item;
                converted[String(key)] = convertRemoteObjectValue(isRecord(value) && "type" in value && "value" in value
                    ? value.value
                    : value);
            }
            return converted;
        }
        return data.map((item) => convertRemoteObjectValue(item));
    }
    if (isRecord(data)) {
        if ("type" in data && "value" in data) {
            return convertRemoteObjectValue(data.value);
        }
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [
            key,
            convertRemoteObjectValue(value),
        ]));
    }
    return data;
}
export function normalizeRemoteObjectResult(result) {
    if (!isRemoteObjectLike(result)) {
        return result;
    }
    try {
        const remoteObject = result;
        if (remoteObject.value !== undefined && remoteObject.value !== null) {
            return remoteObject.value;
        }
        const deepValue = remoteObject.deep_serialized_value?.value ??
            remoteObject.deepSerializedValue?.value;
        if (deepValue !== undefined) {
            return convertRemoteObjectValue(deepValue);
        }
        return result;
    }
    catch {
        return result;
    }
}
