# 🎹↯ MIDI Sequencer

A browser-based 16-step MIDI sequencer for creating and playing musical patterns. This tool allows users to:

- Multi-track sequencing with 16 steps per lane.
- Color coding for easy lane identification.
- Adjust note velocity and duration for each step
- Control playback with play, pause, and stop functions
- Record MIDI input in real-time
- Quantize note durations.
- Mute individual lanes
- Adjust tempo (BPM) on the fly
- Route MIDI data to external devices or use the built-in synthesizer ([Tone.js](https://tonejs.github.io/))

Designed for simplicity, it offers core sequencing features without complex menus or setups. Ideal for quick musical
sketches, live performance, or as a learning tool for MIDI sequencing concepts.

## 🖥️ Demo

[View Live Demo](https://midi-sequencer-six.vercel.app/)

## 🚀 Installation

```shell
# Clone the repository
git clone git@github.com:HelgeSverre/sequencer.git

# Navigate to the project directory
cd sequencer

# Install dependencies
yarn install

# Start the development server
yarn dev

# Build the project for production
yarn build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing-feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE.md).

## 🙏 Acknowledgements

- [Tone.js](https://tonejs.github.io/) for the audio synthesis capabilities
- [Alpine.js](https://alpinejs.dev/) for the reactive UI framework
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide Icons](https://lucide.dev/) for the beautiful SVG icons used in the interface
