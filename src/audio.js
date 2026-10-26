// Tactical sound engine: short, layered cues designed to remain useful at low volume.
let sharedAudioContext = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContextClass();
  if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume().catch(() => {});
  return sharedAudioContext;
};

const makeGain = (context, startTime, peak, duration) => {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  gain.connect(context.destination);
  return gain;
};

const tone = (context, { frequency, endFrequency = frequency, waveform = 'sine', time, duration = 0.12, volume = 0.08 }) => {
  const oscillator = context.createOscillator();
  const gain = makeGain(context, time, volume, duration);
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), time + duration);
  oscillator.connect(gain);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.03);
};

const filteredNoise = (context, { time, duration, volume = 0.1, frequency = 1400, q = 1.5 }) => {
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = makeGain(context, time, volume, duration);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, time);
  filter.Q.setValueAtTime(q, time);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  source.start(time);
};

export const speakTactical = (phrase, muted = false) => {
  if (muted || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1.03;
    utterance.pitch = 0.82;
    utterance.volume = 0.82;
    const voices = window.speechSynthesis.getVoices();
    const commandVoice = voices.find(voice => voice.lang.startsWith('en') && /(Natural|Google|David|Male)/i.test(voice.name));
    if (commandVoice) utterance.voice = commandVoice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Browser speech support is optional.
  }
};

export const playTacticalSound = (type = 'blip') => {
  try {
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime + 0.01;

    if (type === 'alert') {
      tone(context, { frequency: 760, endFrequency: 590, waveform: 'sawtooth', time: now, duration: 0.22, volume: 0.055 });
      tone(context, { frequency: 590, endFrequency: 760, waveform: 'sawtooth', time: now + 0.24, duration: 0.22, volume: 0.055 });
      tone(context, { frequency: 115, endFrequency: 95, waveform: 'sine', time: now, duration: 0.48, volume: 0.07 });
    } else if (type === 'jamming') {
      filteredNoise(context, { time: now, duration: 0.46, volume: 0.12, frequency: 1850, q: 2.3 });
      tone(context, { frequency: 125, endFrequency: 70, waveform: 'triangle', time: now, duration: 0.44, volume: 0.06 });
      tone(context, { frequency: 2400, endFrequency: 1050, waveform: 'square', time: now + 0.04, duration: 0.28, volume: 0.024 });
    } else if (type === 'lock') {
      tone(context, { frequency: 1320, endFrequency: 1750, waveform: 'square', time: now, duration: 0.07, volume: 0.055 });
      tone(context, { frequency: 1600, endFrequency: 2200, waveform: 'square', time: now + 0.105, duration: 0.1, volume: 0.065 });
      tone(context, { frequency: 330, endFrequency: 410, waveform: 'sine', time: now, duration: 0.2, volume: 0.025 });
    } else if (type === 'waypoint') {
      tone(context, { frequency: 523.25, waveform: 'sine', time: now, duration: 0.13, volume: 0.06 });
      tone(context, { frequency: 659.25, waveform: 'sine', time: now + 0.085, duration: 0.16, volume: 0.065 });
      tone(context, { frequency: 783.99, waveform: 'triangle', time: now + 0.17, duration: 0.2, volume: 0.04 });
    } else {
      tone(context, { frequency: 1180, endFrequency: 970, waveform: 'sine', time: now, duration: 0.065, volume: 0.045 });
      tone(context, { frequency: 2100, endFrequency: 1800, waveform: 'triangle', time: now, duration: 0.045, volume: 0.014 });
    }
  } catch {
    // Audio is progressive enhancement; UI functions normally if unavailable.
  }
};
