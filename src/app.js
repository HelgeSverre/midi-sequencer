import * as Tone from "tone";

const PERSIST_KEY = "sequencer_data";
const CHORD_THRESHOLD = 50;

const synth = new Tone.PolySynth().toDestination();

export default () => {
  return {
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    currentStep: 0,
    sequences: [
      {
        midiChannel: 0,
        steps: Array(16).fill(null),
        isMuted: false,
        isSolo: false,
      },
    ],
    lastStepTime: performance.now(),
    midiAccess: null,
    midiInputs: [],
    midiOutputs: [],
    midiInputSelections: [null],
    midiOutputSelections: [null],
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
    noteOnTimes: {},
    chordEditorNotes: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71],

    colors: [
      { label: "White", value: "#ffffff", text: "black" },
      { label: "Black", value: "#000000", text: "white" },
      { label: "Gray", value: "#3F3F46", text: "white" },
      { label: "Red", value: "#fca5a5" },
      { label: "Orange", value: "#fdba74" },
      { label: "Amber", value: "#fcd34d" },
      { label: "Yellow", value: "#fde047" },
      { label: "Lime", value: "#bef264" },
      { label: "Green", value: "#86efac" },
      { label: "Emerald", value: "#6ee7b7" },
      { label: "Teal", value: "#5eead4" },
      { label: "Cyan", value: "#67e8f9" },
      { label: "Sky", value: "#7dd3fc" },
      { label: "Blue", value: "#93c5fd" },
      { label: "Indigo", value: "#a5b4fc" },
      { label: "Violet", value: "#c4b5fd" },
      { label: "Purple", value: "#d8b4fe" },
      { label: "Fuchsia", value: "#f0abfc" },
      { label: "Pink", value: "#f9a8d4" },
      { label: "Rose", value: "#fda4af" },
    ],

    async init() {
      await this.initMidi();
      this.loadPersistedData();
      this.setupWatchers();
      this.startUpdateLoop();
    },

    async initMidi() {
      try {
        this.midiAccess = await navigator.requestMIDIAccess();
        this.midiInputs = Array.from(this.midiAccess.inputs.values());
        this.midiOutputs = Array.from(this.midiAccess.outputs.values());

        // Add Tone.js as a special output option
        this.midiOutputs.push({ id: "tone", name: "Tone.js Output" });

        // Initialize midiInputSelections and midiOutputSelections
        this.midiInputSelections = this.sequences.map(() => null);
        this.midiOutputSelections = this.sequences.map(() => "");

        this.setupMidiListeners();

        this.midiStatus = "MIDI initialized successfully";
      } catch (err) {
        console.error("Could not access MIDI devices:", err);
        this.midiStatus = "Failed to initialize MIDI";
      }
    },

    setupMidiListeners() {
      this.sequences.forEach((sequence, index) => {
        this.updateMidiInput(index);
      });
    },

    chordEditorNotesOctaveDown() {
      this.chordEditorNotes = this.chordEditorNotes.map((note) => note - 12);
    },

    chordEditorNotesOctaveUp() {
      this.chordEditorNotes = this.chordEditorNotes.map((note) => note + 12);
    },

    toggleMute(laneIndex) {
      this.sequences[laneIndex].isMuted = !this.sequences[laneIndex].isMuted;
      if (this.sequences[laneIndex].isMuted) {
        this.sequences[laneIndex].isSolo = false;
      }
    },

    toggleSolo(laneIndex) {
      this.sequences[laneIndex].isSolo = !this.sequences[laneIndex].isSolo;
      if (this.sequences[laneIndex].isSolo) {
        this.sequences[laneIndex].isMuted = false;
      }
    },

    isLaneActive(laneIndex) {
      const soloActive = this.sequences.some((lane) => lane.isSolo);
      return (
        !this.sequences[laneIndex].isMuted && (!soloActive || this.sequences[laneIndex].isSolo)
      );
    },

    reset() {
      this.sequences = [
        { midiChannel: 0, steps: Array(16).fill(null), isMuted: false, isSolo: false },
      ];
      this.midiInputSelections = [null];
      this.midiOutputSelections = [null];
      this.bpm = 120;
    },

    clearPersistedData() {
      localStorage.removeItem(PERSIST_KEY);
    },

    loadPersistedData() {
      try {
        const loaded = JSON.parse(localStorage.getItem(PERSIST_KEY));

        if (!loaded) return;

        // Load sequences
        this.sequences = loaded.sequences || this.sequences;

        // Load MIDI input and output selections
        this.midiInputSelections = loaded.midiInputSelections || [null];
        this.midiOutputSelections = loaded.midiOutputSelections || [null];

        // Load BPM
        this.bpm = loaded.bpm || this.bpm;

        // Ensure midiInputSelections and midiOutputSelections match the sequence length
        while (this.midiInputSelections.length < this.sequences.length) {
          this.midiInputSelections.push(null);
        }
        while (this.midiOutputSelections.length < this.sequences.length) {
          this.midiOutputSelections.push(null);
        }

        // Trim excess selections if necessary
        this.midiInputSelections = this.midiInputSelections.slice(0, this.sequences.length);
        this.midiOutputSelections = this.midiOutputSelections.slice(0, this.sequences.length);

        // Re-hookup MIDI inputs using the new updateMidiInput function
        this.sequences.forEach((sequence, index) => {
          this.updateMidiInput(index);
        });

        // Validate MIDI outputs
        this.midiOutputSelections = this.midiOutputSelections.map((outputId) => {
          if (outputId === "tone" || this.midiOutputs.some((output) => output.id === outputId)) {
            return outputId;
          } else {
            console.warn(`MIDI output ${outputId} not found. Clearing selection.`);
            return null;
          }
        });

        console.log("Persisted data loaded and MIDI devices re-hooked:", {
          sequences: this.sequences,
          midiInputSelections: this.midiInputSelections,
          midiOutputSelections: this.midiOutputSelections,
          bpm: this.bpm,
        });
      } catch (err) {
        console.error("Could not load persisted data:", err);
      }
    },

    setupWatchers() {
      this.$watch("sequences", () => this.persistData(), { deep: true });
      this.$watch("midiInputSelections", () => this.persistData());
      this.$watch("midiOutputSelections", () => this.persistData());
      this.$watch("bpm", () => this.persistData());
    },

    persistData() {
      const data = {
        sequences: this.sequences,
        midiInputSelections: this.midiInputSelections,
        midiOutputSelections: this.midiOutputSelections,
        bpm: this.bpm,
      };

      localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
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
        this.sequences[this.editingLaneIndex].steps[this.editingStepIndex] = this.editingStep;
      } else {
        this.sequences[this.editingLaneIndex].steps[this.editingStepIndex] = null;
      }
      this.closeChordEditor();
    },

    playStep() {
      const currentTime = performance.now();
      this.sequences.forEach((lane, laneIndex) => {
        if (this.isLaneActive(laneIndex)) {
          const step = lane.steps[this.currentStep];

          if (step && step.notes.length > 0) {
            this.sendMidiNotes(laneIndex, step.notes, step.velocity, step.duration, currentTime);
          }
        }
      });
    },

    quantizeAllNotes() {
      const stepDuration = 60000 / this.bpm / 4; // Duration of a 16th note in ms

      this.sequences.forEach((lane) => {
        lane.steps.forEach((step) => {
          if (step && step.duration) {
            // Round the duration to the nearest multiple of stepDuration
            step.duration = Math.round(step.duration / stepDuration) * stepDuration;
          }
        });
      });
    },

    sendMidiNotes(laneIndex, notes, velocity, duration, startTime) {
      console.log("sendMidiNotes", {
        laneIndex,
        notes,
        velocity,
        duration,
        startTime,
        channel: this.sequences[laneIndex].midiChannel,
      });

      const outputId = this.midiOutputSelections[laneIndex];
      if (outputId === "" || outputId === null) {
        return;
      }

      // Make sound with Tone.js if selected as output
      if (outputId === "tone") {
        const freq = notes.map((note) => Tone.Frequency(note, "midi").toFrequency());
        console.log("Playing note", notes, freq, "for", duration, "ms");
        synth.triggerAttackRelease(freq, duration / 1000, Tone.now(), velocity);
        return;
      }

      const output = this.midiOutputs.find((output) => output.id === outputId);
      if (output) {
        const channel = this.sequences[laneIndex].midiChannel;
        for (const note of notes) {
          // Send note on and note off messages
          output.send([0x90 + channel, note, Math.round(velocity * 127)], startTime);
          output.send([0x80 + channel, note, 0], startTime + duration);
        }
      }
    },

    handleMidiMessage(message, inputId, laneIndex) {
      const [status, note, velocity] = message.data;
      const channel = status & 0xf;
      const isNoteOn = (status & 0xf0) === 0x90;
      const isNoteOff = (status & 0xf0) === 0x80;

      console.log("handleMidiMessage", {
        data: message.data.map((d) => parseInt(d).toString(16)).join(" "),
        input: inputId,
        lane: laneIndex,
        channel,
        type: isNoteOn ? "Note On" : isNoteOff ? "Note Off" : "Other",
      });

      // Route the message to the appropriate output
      this.routeMidiMessage(laneIndex, status, note, velocity);

      if (this.isRecording) {
        if (isNoteOn && velocity > 0) {
          this.handleNoteOn(laneIndex, note, velocity);
        } else if (isNoteOff || (isNoteOn && velocity === 0)) {
          this.handleNoteOff(laneIndex, note);
        }
      }
    },
    routeMidiMessage(laneIndex, status, note, velocity) {
      const outputId = this.midiOutputSelections[laneIndex];
      if (!outputId || outputId === "") {
        return; // No output selected, do nothing
      }

      if (outputId === "tone") {
        // Handle Tone.js output
        const messageType = status & 0xf0;
        if (messageType === 0x90 && velocity > 0) {
          const freq = Tone.Frequency(note, "midi").toFrequency();
          synth.triggerAttack(freq, Tone.now(), velocity / 127);
        } else if (messageType === 0x80 || (messageType === 0x90 && velocity === 0)) {
          const freq = Tone.Frequency(note, "midi").toFrequency();
          synth.triggerRelease(freq);
        }
      } else {
        const output = this.midiOutputs.find((output) => output.id === outputId);
        if (output) {
          const outputChannel = this.sequences[laneIndex].midiChannel;
          const newStatus = (status & 0xf0) | outputChannel;
          output.send([newStatus, note, velocity]);

          console.log(
            `Routed MIDI message: Lane ${laneIndex} -> Output "${output.name}" ch ${outputChannel}`,
          );
        }
      }
    },

    handleNoteOn(laneIndex, note, velocity) {
      const currentTime = performance.now();
      const currentStep = this.currentStep;
      const sequence = this.sequences[laneIndex];

      // Check if there's an existing step within the chord threshold
      let step = sequence.steps[currentStep];
      if (step && currentTime - step.startTime < CHORD_THRESHOLD) {
        // Add the note to the existing chord
        if (!step.notes.includes(note)) {
          step.notes.push(note);
        }
      } else {
        // Create a new step for a new chord or single note
        step = {
          notes: [note],
          velocity: velocity / 127,
          duration: 100, // Initial duration, will be updated on note off
          isRecording: true,
          startTime: currentTime,
        };
        sequence.steps[currentStep] = step;
      }

      // Store the note-on time for duration calculation
      this.noteOnTimes[`${laneIndex}-${note}`] = {
        time: currentTime,
        step: currentStep,
      };
    },

    handleNoteOff(laneIndex, note) {
      const sequence = this.sequences[laneIndex];
      const noteOnInfo = this.noteOnTimes[`${laneIndex}-${note}`];
      if (noteOnInfo) {
        const { time: noteOnTime, step: noteOnStep } = noteOnInfo;
        const duration = Math.round(performance.now() - noteOnTime);

        // Update the duration of the step where the note started
        const step = sequence.steps[noteOnStep];
        if (step && step.notes.includes(note)) {
          // Set the duration to the longest note in the chord
          step.duration = Math.max(step.duration, duration);
        }

        delete this.noteOnTimes[`${laneIndex}-${note}`];

        // If all notes in the chord are released, finalize the step
        if (
          Object.keys(this.noteOnTimes).filter((key) => key.startsWith(`${laneIndex}-`)).length ===
          0
        ) {
          step.isRecording = false;
        }
      }
    },

    updateBpm() {
      // BPM update logic (if needed)
    },

    cloneLane(index) {
      const newLane = JSON.parse(JSON.stringify(this.sequences[index]));
      this.sequences.push(newLane);
      this.midiInputSelections.push(this.midiInputSelections[index]);
      this.midiOutputSelections.push(this.midiOutputSelections[index]);
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
      const inputId = this.midiInputSelections[laneIndex];
      const sequence = this.sequences[laneIndex];

      // Remove previous listener if exists
      if (sequence.midiListener) {
        const oldInput = this.midiInputs.find(
          (input) => input.id === sequence.midiListener.inputId,
        );
        if (oldInput) {
          oldInput.removeEventListener("midimessage", sequence.midiListener.handler);
        }
        delete sequence.midiListener;
      }

      if (inputId === null) {
        return;
      }

      const input = this.midiInputs.find((input) => input.id === inputId);
      if (input) {
        const handler = (message) => {
          const [status, note, velocity] = message.data;
          const channel = status & 0xf;

          // Process messages for the specified channel or if set to "all"
          if (channel === sequence.midiChannel) {
            this.handleMidiMessage(message, inputId, laneIndex);
          }
        };

        input.addEventListener("midimessage", handler);
        sequence.midiListener = { inputId, handler };
      }
    },

    updateMidiOutput(laneIndex) {
      // Do nothing yet.
    },

    updateMidiChannel(laneIndex, channel) {
      console.log("updateMidiChannel", { laneIndex, channel });

      this.sequences[laneIndex].midiChannel = channel;
      this.updateMidiInput(laneIndex);
    },

    allNotesOff() {
      this.sequences.forEach((lane, laneIndex) => {
        const outputId = this.midiOutputSelections[laneIndex];
        if (outputId !== "" && outputId !== null) {
          return;
        }

        if (outputId === "tone") {
          // Tone.js output
          synth.triggerRelease(Tone.now());
        } else {
          // Regular MIDI output
          const output = this.midiOutputs.find((output) => output.id === outputId);
          if (output) {
            const channel = lane.midiChannel;
            for (let note = 0; note < 128; note++) {
              output.send([0x80 + channel, note, 0]); // Note Off
            }
          }
        }
      });
    },

    addLane() {
      this.sequences.push({
        midiChannel: 0,
        steps: Array(16).fill(null),
      });
      this.midiInputSelections.push("");
      this.midiOutputSelections.push("");
    },
  };
};
