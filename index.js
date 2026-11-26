import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKleinClawPluginEntry } from "./dist/plugin-entry.js";

export default definePluginEntry(createKleinClawPluginEntry());
