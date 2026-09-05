export class CombatAudio {
  private context?: AudioContext
  private master?: GainNode
  private engineGain?: GainNode
  private engineFilter?: BiquadFilterNode
  private engineSource?: AudioBufferSourceNode
  private enabled = true

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.gain.value = this.enabled ? 0.38 : 0
        this.master.connect(this.context.destination)
        const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate)
        const data = buffer.getChannelData(0)
        let last = 0
        for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * 0.045) / 1.04; data[i] = last * 3 }
        this.engineSource = this.context.createBufferSource()
        this.engineSource.buffer = buffer; this.engineSource.loop = true
        this.engineFilter = this.context.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 240
        this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0
        this.engineSource.connect(this.engineFilter).connect(this.engineGain).connect(this.master)
        this.engineSource.start()
      }
      if (this.context.state === 'suspended') await this.context.resume()
    } catch { /* Flight remains usable on devices with unavailable audio. */ }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? 0.38 : 0, this.context.currentTime, 0.1)
  }

  update(playing: boolean, boost: boolean) {
    if (!this.context || !this.engineGain || !this.engineFilter) return
    this.engineGain.gain.setTargetAtTime(playing ? boost ? 0.27 : 0.14 : 0, this.context.currentTime, 0.3)
    this.engineFilter.frequency.setTargetAtTime(boost ? 560 : 260, this.context.currentTime, 0.4)
  }

  play(type: 'launch' | 'gun' | 'hit' | 'kill' | 'damage' | 'flare' | 'lock' | 'incoming') {
    if (!this.context || !this.master || !this.enabled) return
    const ctx = this.context, now = ctx.currentTime
    const gain = ctx.createGain(); gain.connect(this.master)
    const osc = ctx.createOscillator(); osc.connect(gain)
    if (type === 'lock') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(960, now)
      gain.gain.setValueAtTime(0.065, now); gain.gain.setValueAtTime(0, now + 0.08); gain.gain.setValueAtTime(0.065, now + 0.14)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25); osc.start(); osc.stop(now + 0.26)
    } else if (type === 'incoming') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(790, now); osc.frequency.setValueAtTime(590, now + 0.15)
      gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42); osc.start(); osc.stop(now + 0.43)
    } else {
      const gun = type === 'gun', explosion = ['kill', 'hit', 'damage'].includes(type)
      const duration = gun ? 0.075 : explosion ? 0.58 : 0.4
      osc.type = gun ? 'square' : 'sawtooth'
      osc.frequency.setValueAtTime(gun ? 83 : explosion ? 94 : 340, now)
      osc.frequency.exponentialRampToValueAtTime(gun ? 36 : explosion ? 19 : 48, now + duration)
      gain.gain.setValueAtTime(gun ? 0.035 : explosion ? 0.16 : 0.065, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.start(); osc.stop(now + duration + 0.02)
    }
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
  }

  dispose() { this.engineSource?.stop(); void this.context?.close() }
}
