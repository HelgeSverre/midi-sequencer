import { getNoteNameFromMidiNumber } from "@/utils.js";

export default () => {
  return {
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    currentStep: 0,
    sequences: [
      { midiChannel: 1, steps: Array(16).fill(null) },
      { midiChannel: 2, steps: Array(16).fill(null) },
      { midiChannel: 3, steps: Array(16).fill(null) },
    ],
    lastStepTime: performance.now(),
    midiAccess: null,
    midiInputs: [],
    midiOutputs: [],
    midiInputSelections: [""],
    midiOutputSelections: [""],
    midiStatus: "MIDI not initialized",
    chordEditorOpen: false,
    chordEditorPosition: { x: 0, y: 0 },
    editingLaneIndex: null,
    editingStepIndex: null,
    editingStep: {
      notes: [],
      velocity: 0.7,
    },
    async init() {
      await this.initMidi();
      this.startUpdateLoop();
    },
    async initMidi() {
      try {
        this.midiAccess = await navigator.requestMIDIAccess();
        this.midiInputs = Array.from(this.midiAccess.inputs.values());
        this.midiOutputs = Array.from(this.midiAccess.outputs.values());
        this.midiStatus = "MIDI initialized successfully";
      } catch (err) {
        console.error("Could not access MIDI devices:", err);
        this.midiStatus = "Failed to initialize MIDI";
      }
    },
    startUpdateLoop() {
      const update = () => {
        if (this.isPlaying) {
          const currentTime = performance.now();
          const msPerStep = 60000 / this.bpm / 4; // Assuming quarter notes
          if (currentTime - this.lastStepTime >= msPerStep) {
            this.playStep();
            this.currentStep = (this.currentStep + 1) % 16;
            this.lastStepTime = currentTime;
          }
        }
        requestAnimationFrame(update);
      };
      update();
    },
    togglePlay() {
      this.isPlaying = !this.isPlaying;
      if (this.isPlaying) {
        this.lastStepTime = performance.now();
      }
    },
    stop() {
      this.isPlaying = false;
      this.currentStep = 0;
      this.allNotesOff();
    },
    toggleRecord() {
      this.isRecording = !this.isRecording;
    },
    openChordEditor(laneIndex, stepIndex) {
      const rect = event.target.getBoundingClientRect();
      this.chordEditorPosition = {
        x: rect.left,
        y: rect.bottom + window.scrollY,
      };
      this.editingLaneIndex = laneIndex;
      this.editingStepIndex = stepIndex;
      this.editingStep = this.sequences[laneIndex].steps[stepIndex] || {
        notes: [],
        velocity: 0.7,
      };
      this.chordEditorOpen = true;
    },
    closeChordEditor() {
      this.chordEditorOpen = false;
    },
    isNoteInChord(note) {
      return this.editingStep.notes.includes(note);
    },
    toggleNoteInChord(note) {
      const index = this.editingStep.notes.indexOf(note);
      if (index > -1) {
        this.editingStep.notes.splice(index, 1);
      } else {
        this.editingStep.notes.push(note);
      }
    },
    saveChord() {
      if (this.editingStep.notes.length > 0) {
        this.sequences[this.editingLaneIndex].steps[this.editingStepIndex] =
          this.editingStep;
      } else {
        this.sequences[this.editingLaneIndex].steps[this.editingStepIndex] =
          null;
      }
      this.closeChordEditor();
    },
    getStepDisplay(step) {
      if (!step || step.notes.length === 0) return "";
      if (step.notes.length === 1)
        return getNoteNameFromMidiNumber(step.notes[0]);
      return `Chord (${step.notes.length})`;
    },
    playStep() {
      this.sequences.forEach((lane, laneIndex) => {
        const step = lane.steps[this.currentStep];
        if (step && step.notes.length > 0) {
          step.notes.forEach((note) => {
            this.sendMidiNote(laneIndex, note, step.velocity);
          });
        }
      });
    },
    sendMidiNote(laneIndex, note, velocity) {
      const outputIndex = this.midiOutputSelections[laneIndex];
      if (outputIndex !== "") {
        const output = this.midiOutputs[outputIndex];
        const channel = this.sequences[laneIndex].midiChannel - 1;
        output.send([0x90 + channel, note, Math.round(velocity * 127)]); // Note On
        setTimeout(() => {
          output.send([0x80 + channel, note, 0]); // Note Off
        }, 100); // Note duration
      }
    },
    handleMidiMessage(message, laneIndex) {
      if (this.isRecording) {
        const [status, note, velocity] = message.data;
        if (status >= 144 && status <= 159 && velocity > 0) {
          // Note On, any channel
          const currentStep = this.sequences[laneIndex].steps[
            this.currentStep
          ] || {
            notes: [],
            velocity: 0.7,
          };
          if (!currentStep.notes.includes(note)) {
            currentStep.notes.push(note);
          }
          currentStep.velocity = velocity / 127;
          this.sequences[laneIndex].steps[this.currentStep] = currentStep;
        }
      }
    },
    updateBpm() {
      // BPM update logic (if needed)
    },
    addLane() {
      this.sequences.push({
        midiChannel: 1,
        steps: Array(16).fill(null),
      });
      this.midiInputSelections.push("");
      this.midiOutputSelections.push("");
    },
    cloneLane(index) {
      const clonedLane = JSON.parse(JSON.stringify(this.sequences[index]));
      this.sequences.splice(index + 1, 0, clonedLane);
      this.midiInputSelections.splice(
        index + 1,
        0,
        this.midiInputSelections[index],
      );
      this.midiOutputSelections.splice(
        index + 1,
        0,
        this.midiOutputSelections[index],
      );
    },
    removeLane(index) {
      this.sequences.splice(index, 1);
      this.midiInputSelections.splice(index, 1);
      this.midiOutputSelections.splice(index, 1);
    },
    clearLane(index) {
      this.sequences[index].steps.fill(null);
    },
    clearAll() {
      this.sequences.forEach((lane) => lane.steps.fill(null));
    },
    updateMidiInput(laneIndex) {
      const inputIndex = this.midiInputSelections[laneIndex];
      if (inputIndex !== "") {
        this.midiInputs[inputIndex].onmidimessage = (message) => {
          this.handleMidiMessage(message, laneIndex);
        };
      }
    },
    updateMidiOutput(laneIndex) {
      // MIDI output update logic (if needed)
    },
    updateMidiChannel(laneIndex) {
      // MIDI channel update logic (if needed)
    },
    allNotesOff() {
      this.sequences.forEach((lane, laneIndex) => {
        const outputIndex = this.midiOutputSelections[laneIndex];
        if (outputIndex !== "") {
          const output = this.midiOutputs[outputIndex];
          const channel = lane.midiChannel - 1;
          for (let note = 0; note < 128; note++) {
            output.send([0x80 + channel, note, 0]); // Note Off
          }
        }
      });
    },
  };
};
