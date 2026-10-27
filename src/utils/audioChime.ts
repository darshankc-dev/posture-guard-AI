/**
 * Web Audio API synthesizer for PostureGuard notification chime.
 * Generates the identical two-tone harmonic bell chime as the Python chime.wav asset.
 */

let audioCtx: AudioContext | null = null;

export function playHarmonicChime(volume: number = 0.8): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(1.0, volume)), now);
    masterGain.connect(audioCtx.destination);

    // Fundamental (587.33 Hz - D5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.55, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc1.connect(gain1);
    gain1.connect(masterGain);

    // Harmonic 2 (880.00 Hz - A5)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now);
    gain2.gain.setValueAtTime(0.30, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(masterGain);

    // Harmonic 3 (1174.66 Hz - D6)
    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1174.66, now);
    gain3.gain.setValueAtTime(0.15, now);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc3.connect(gain3);
    gain3.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    osc1.stop(now + 0.70);
    osc2.stop(now + 0.70);
    osc3.stop(now + 0.70);
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}
