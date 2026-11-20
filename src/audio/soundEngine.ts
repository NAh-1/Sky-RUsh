/**
 * Procedural Web Audio API sound engine for SKY RUSH.
 * Generates burner roar, wind whoosh, harmonic coin chimes, hazard proximity beeps,
 * power-up fanfares, shield pop, and comical crash thud with zero external audio files.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private burnerGain: GainNode | null = null;
  private burnerFilter: BiquadFilterNode | null = null;
  private muted = false;
  private initialized = false;
  private lastWarnTime = 0;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.setupContinuousLoops();
      this.initialized = true;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(seconds = 2): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Soft pink/brownish rolloff for pleasant air/flame texture
      lastOut = (lastOut + 0.04 * white) / 1.04;
      data[i] = lastOut * 3.2;
    }
    return buffer;
  }

  private setupContinuousLoops(): void {
    if (!this.ctx || !this.masterGain) return;
    const noiseBuffer = this.createNoiseBuffer(2.5);
    if (!noiseBuffer) return;

    // Gentle sky wind loop
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.9;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;

    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();

    // Gentle propane burner roar loop
    const burnerSrc = this.ctx.createBufferSource();
    burnerSrc.buffer = noiseBuffer;
    burnerSrc.loop = true;

    this.burnerFilter = this.ctx.createBiquadFilter();
    this.burnerFilter.type = 'lowpass';
    this.burnerFilter.frequency.value = 260;

    this.burnerGain = this.ctx.createGain();
    this.burnerGain.gain.value = 0.0;

    burnerSrc.connect(this.burnerFilter);
    this.burnerFilter.connect(this.burnerGain);
    this.burnerGain.connect(this.masterGain);
    burnerSrc.start();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Smoothly updates continuous wind and burner roar based on flight telemetry.
   */
  public updateFlightLoops(
    active: boolean,
    burnerLevel: number,
    speedNorm: number,
    venting: boolean
  ): void {
    if (!this.initialized || !this.ctx || !this.windGain || !this.burnerGain) return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.windGain.gain.setTargetAtTime(0.015, now, 0.12);
      this.burnerGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const windVol = 0.04 + speedNorm * 0.11 + (venting ? 0.06 : 0);
    const windFreq = 260 + speedNorm * 520 + (venting ? 260 : 0);
    this.windGain.gain.setTargetAtTime(windVol, now, 0.08);
    this.windFilter?.frequency.setTargetAtTime(windFreq, now, 0.1);

    const burnerVol = burnerLevel > 0.05 ? 0.08 + burnerLevel * 0.18 : 0;
    const burnerFreq = 210 + burnerLevel * 280;
    this.burnerGain.gain.setTargetAtTime(burnerVol, now, 0.05);
    this.burnerFilter?.frequency.setTargetAtTime(burnerFreq, now, 0.05);
  }

  public playCoin(combo = 1): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const semitoneBoost = Math.min(combo - 1, 10);
    const baseFreq = 784 * Math.pow(2, semitoneBoost / 12);

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.07);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 2, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.26);
    osc2.stop(now + 0.26);
  }

  public playPowerUp(kind: 'shield' | 'magnet' | 'thermal'): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const notes =
      kind === 'shield'
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === 'magnet'
        ? [440, 554.37, 659.25, 880]
        : [392, 523.25, 659.25, 987.77];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.055;
      osc.type = kind === 'thermal' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playWarningBeep(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastWarnTime < 520) return;
    this.lastWarnTime = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.06);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playShieldPop(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playCrash(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Comical cartoon pop + low thud
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(520, now);
    popOsc.frequency.exponentialRampToValueAtTime(68, now + 0.22);
    popGain.gain.setValueAtTime(0.38, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    popOsc.connect(popGain);
    popGain.connect(this.masterGain);
    popOsc.start(now);
    popOsc.stop(now + 0.26);

    // Wobbly downward slide whistle
    const slideOsc = this.ctx.createOscillator();
    const slideGain = this.ctx.createGain();
    slideOsc.type = 'triangle';
    slideOsc.frequency.setValueAtTime(420, now + 0.06);
    slideOsc.frequency.exponentialRampToValueAtTime(110, now + 0.45);
    slideGain.gain.setValueAtTime(0.001, now + 0.06);
    slideGain.gain.linearRampToValueAtTime(0.18, now + 0.1);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    slideOsc.connect(slideGain);
    slideGain.connect(this.masterGain);
    slideOsc.start(now + 0.06);
    slideOsc.stop(now + 0.5);
  }

  public playTap(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.04);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playStartFanfare(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playCountdownTick(count: number): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const freq = count === 1 ? 880 : count === 2 ? 740 : 620;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playShutter(): void {
    if (this.muted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Crisp camera shutter snap + bright chime
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1240, now);
    osc.frequency.exponentialRampToValueAtTime(1680, now + 0.09);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
