// Web Audio cues - no audio files, generated on the fly.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  // iOS requires a sound to actually play during the gesture to fully unlock.
  try {
    const buffer = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* noop */
  }
}

function beep(freq: number, durationMs: number, volume = 0.25) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationMs / 1000 + 0.05);
}

export const tickBeep = () => beep(660, 120, 0.18);
export const startBeep = () => beep(880, 320, 0.3);
export const restBeep = () => beep(440, 320, 0.25);
export const finishBeep = () => {
  beep(660, 200, 0.3);
  setTimeout(() => beep(880, 200, 0.3), 220);
  setTimeout(() => beep(1100, 400, 0.3), 440);
};

export function speak(text: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}
