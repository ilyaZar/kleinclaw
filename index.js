import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKleinClawPluginEntry } from "./src/plugin-entry.js";

export default definePluginEntry(createKleinClawPluginEntry());
