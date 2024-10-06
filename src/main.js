// src/main.js
import Alpine from "alpinejs";
import focus from "@alpinejs/focus";
import "./style.css";
import "./app.css";
import app from "./app";
import { getNoteNameFromMidiNumber } from "@/utils.js";

Alpine.plugin(focus);

Alpine.data("app", app);

Alpine.magic(
  "noteFromMidi",
  () => (midiNumber) => getNoteNameFromMidiNumber(midiNumber),
);

window.Alpine = Alpine;

Alpine.start();
