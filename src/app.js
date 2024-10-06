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
        midiChannel: 1,
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

        // Initialize midiOutputSelections with empty strings
        this.midiOutputSelections = this.sequences.map(() => "");

        this.midiStatus = "MIDI initialized successfully";
      } catch (err) {
        console.error("Could not access MIDI devices:", err);
        this.midiStatus = "Failed to initialize MIDI";
      }
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
        { midiChannel: 1, steps: Array(16).fill(null), isMuted: false, isSolo: false },
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

        // Re-hookup MIDI inputs
        this.midiInputSelections.forEach((inputId, index) => {
          if (inputId) {
            const input = this.midiInputs.find((i) => i.id == inputId);
            if (input) {
              input.onmidimessage = (message) => this.handleMidiMessage(message, index);
            } else {
              console.warn(`MIDI input ${inputId} not found. Clearing selection.`);
              this.midiInputSelections[index] = null;
            }
          }
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

    handleMidiMessage(message, laneIndex) {
      console.log("handleMidiMessage", {
        data: message.data.map((d) => parseInt(d).toString(16)).join(" "),
        laneIndex,
        isRecording: this.isRecording,
      });

      const [status, data1, data2] = message.data;
      const channel = status & 0xf;
      const messageType = status & 0xf0;

      // Route the message to the appropriate output(s)
      this.routeMidiMessage(channel, messageType, data1, data2);

      if (this.isRecording) {
        if (messageType === 0x90 && data2 > 0) {
          this.handleNoteOn(channel, data1, data2);
        } else if (messageType === 0x80 || (messageType === 0x90 && data2 === 0)) {
          this.handleNoteOff(channel, data1);
        }
      }
    },

    routeMidiMessage(inputChannel, messageType, data1, data2) {
      this.sequences.forEach((sequence, index) => {
        if (
          sequence.midiInputSelections === "all" ||
          parseInt(sequence.midiInputSelections) - 1 === inputChannel
        ) {
          const outputId = this.midiOutputSelections[index];
          if (outputId && outputId !== "") {
            const output = this.midiOutputs.find((output) => output.id === outputId);
            if (output) {
              const outputChannel = sequence.midiChannel - 1;
              const newStatus = messageType | outputChannel;
              output.send([newStatus, data1, data2]);

              console.log(
                `Routed MIDI message: Input ch ${inputChannel + 1} -> Output "${output.name}" ch ${outputChannel + 1}`,
              );
            }
          }
        }
      });
    },

    handleNoteOn(channel, note, velocity) {
      const currentTime = performance.now();
      const currentStep = this.currentStep;

      this.sequences.forEach((sequence, laneIndex) => {
        if (
          sequence.midiInputSelections === "all" ||
          parseInt(sequence.midiInputSelections) - 1 === channel
        ) {
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
          this.noteOnTimes[`${laneIndex}-${channel}-${note}`] = {
            time: currentTime,
            step: currentStep,
          };
        }
      });
    },

    handleNoteOff(channel, note) {
      this.sequences.forEach((sequence, laneIndex) => {
        if (
          sequence.midiInputSelections === "all" ||
          parseInt(sequence.midiInputSelections) - 1 === channel
        ) {
          const noteOnInfo = this.noteOnTimes[`${laneIndex}-${channel}-${note}`];
          if (noteOnInfo) {
            const { time: noteOnTime, step: noteOnStep } = noteOnInfo;
            const duration = Math.round(performance.now() - noteOnTime);

            // Update the duration of the step where the note started
            const step = sequence.steps[noteOnStep];
            if (step && step.notes.includes(note)) {
              // Set the duration to the longest note in the chord
              step.duration = Math.max(step.duration, duration);
            }

            delete this.noteOnTimes[`${laneIndex}-${channel}-${note}`];

            // If all notes in the chord are released, finalize the step
            if (
              Object.keys(this.noteOnTimes).filter((key) =>
                key.startsWith(`${laneIndex}-${channel}-`),
              ).length === 0
            ) {
              step.isRecording = false;
            }
          }
        }
      });
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
      if (inputId === "" || inputId === null) {
        return;
      }

      const input = this.midiInputs.find((input) => input.id === inputId);
      if (input) {
        input.onmidimessage = (message) => this.handleMidiMessage(message, laneIndex);
      }
    },

    updateMidiOutput(laneIndex) {
      // Do nothing yet.
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
        midiChannel: 1,
        steps: Array(16).fill(null),
      });
      this.midiInputSelections.push("");
      this.midiOutputSelections.push("");
    },
  };
};
