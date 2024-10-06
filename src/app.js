import { getNoteNameFromMidiNumber } from "@/utils.js";

export default () => {
  return {
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    currentStep: 0,
    sequences: [{ midiChannel: 1, steps: Array(16).fill(null) }],
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
      duration: 100,
    },
    noteOnTimes: {}, // To store the start time of each note for duration calculation
    async init() {
      await this.initMidi();
      this.startUpdateLoop();
    },
    async initMidi() {
      try {
        this.midiAccess = await navigator.requestMIDIAccess();
        this.midiInputs = Array.from(this.midiAccess.inputs.values());
        this.midiOutputs = Array.from(this.midiAccess.outputs.values());

        this.midiInputs.forEach((input) => {
          this.midiInputSelections.push(input.id);
          input.onmidimessage = (message) => {
            console.log(
              "MIDI message received from input " +
                input.id +
                ": " +
                message.data.map((d) => parseInt(d).toString(16)).join(" "),
            );
          };
        });

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
      if (!this.isRecording) {
        // Handle any remaining active notes when stopping recording
        Object.keys(this.noteOnTimes).forEach((key) => {
          const [laneIndex, note] = key.split("-");
          this.handleNoteOff(parseInt(laneIndex), parseInt(note));
        });
        this.noteOnTimes = {};

        // Reset isRecording flag for all steps
        this.sequences.forEach((lane) => {
          lane.steps.forEach((step) => {
            if (step) step.isRecording = false;
          });
        });
      }
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
        duration: 100,
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

      const noteNames = step.notes
        .map((note) => getNoteNameFromMidiNumber(note))
        .join(", ");

      return `${noteNames} (${step.duration}ms)`;
    },
    playStep() {
      const currentTime = performance.now();
      this.sequences.forEach((lane, laneIndex) => {
        const step = lane.steps[this.currentStep];
        if (step && step.notes.length > 0) {
          step.notes.forEach((note) => {
            this.sendMidiNote(
              laneIndex,
              note,
              step.velocity,
              step.duration,
              currentTime,
            );
          });
        }
      });
    },
    sendMidiNote(laneIndex, note, velocity, duration, startTime) {
      const outputIndex = this.midiOutputSelections[laneIndex];
      if (outputIndex !== "") {
        const output = this.midiOutputs[outputIndex];
        const channel = this.sequences[laneIndex].midiChannel - 1;
        output.send([0x90 + channel, note, Math.round(velocity * 127)]); // Note On
        setTimeout(() => {
          output.send([0x80 + channel, note, 0]); // Note Off
        }, duration);
      }
    },
    handleMidiMessage(message, laneIndex) {
      if (this.isRecording) {
        const [status, note, velocity] = message.data;
        const channel = status & 0xf;
        const isNoteOn = (status & 0xf0) === 0x90;
        const isNoteOff = (status & 0xf0) === 0x80;

        if (isNoteOn && velocity > 0) {
          this.handleNoteOn(laneIndex, note, velocity);
        } else if (isNoteOff || (isNoteOn && velocity === 0)) {
          this.handleNoteOff(laneIndex, note);
        }
      }
    },
    handleNoteOn(laneIndex, note, velocity) {
      const currentTime = performance.now();
      this.noteOnTimes[`${laneIndex}-${note}`] = {
        time: currentTime,
        step: this.currentStep,
      };

      // Always create a new step object when a note is pressed
      const newStep = {
        notes: [note],
        velocity: velocity / 127,
        duration: 100, // Initial duration, will be updated on note off
        isRecording: true,
      };

      // Overwrite the current step completely
      this.sequences[laneIndex].steps[this.currentStep] = newStep;
    },

    handleNoteOff(laneIndex, note) {
      const noteOnInfo = this.noteOnTimes[`${laneIndex}-${note}`];
      if (noteOnInfo) {
        const { time: noteOnTime, step: noteOnStep } = noteOnInfo;
        const duration = Math.round(performance.now() - noteOnTime);

        // Update only the step where the note started
        const step = this.sequences[laneIndex].steps[noteOnStep];
        if (step && step.notes.includes(note)) {
          step.duration = duration; // Set the full duration of the note
        }

        delete this.noteOnTimes[`${laneIndex}-${note}`];
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
