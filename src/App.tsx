import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, AudioLines,
  ChevronDown, CircleHelp, Crosshair, Expand, Flame,
  Gauge, Keyboard, MapPin, Minimize, MousePointer2, Pause, Play,
  Radio, RotateCcw, Settings2, Shield, Sparkles, Target, Trophy,
  Volume2, VolumeX, Wind, X, Zap,
} from 'lucide-react'
import { FlightEngine } from './game/engine'
import type { EngineSettings } from './game/engine'
import { initialSnapshot } from './game/types'
import type { FlightInput, GameSnapshot } from './game/types'

type ModalName = 'help' | 'aircraft' | 'settings' | null

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
const number = (value: number) => Math.round(value).toLocaleString('en-US')

function Logo() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 5 2 35h10l8-14 8 14h10L20 5Z" fill="currentColor" /><path d="m20 27-5 8h10l-5-8Z" fill="currentColor" /></svg>
}

function JetIcon({ enemy = false, className = '' }: { enemy?: boolean; className?: string }) {
  return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d={enemy
      ? 'M50 4 46 24 43 40 14 67 12 75 43 68 42 83 28 92 43 91 47 95 50 89 53 95 57 91 72 92 58 83 57 68 88 75 86 67 57 40 54 24Z'
      : 'M50 5 46 25 43 36 13 64 12 72 35 69 42 65 41 78 27 88 29 95 44 91 47 94 50 91 53 94 56 91 71 95 73 88 59 78 58 65 65 69 88 72 87 64 57 36 54 25Z'}
      fill="currentColor" fillOpacity=".11" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d="m50 20-3 28v29m3-57 3 28v29M44 54 22 68m34-14 22 14M46 84l-2-17m10 17 2-17" stroke="currentColor" strokeOpacity=".5" strokeWidth=".8" />
    <path d="M47 84h6M47 89h6" stroke="currentColor" strokeWidth="2" />
  </svg>
}

function Key({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <kbd className={wide ? 'key key-wide' : 'key'}>{children}</kbd>
}

function Compass({ heading }: { heading: number }) {
  return <div className="compass" aria-label={`航向 ${heading} 度`}>
    <div className="compass-track">{[-45, -30, -15, 0, 15, 30, 45].map(offset => {
      const bearing = (Math.round(heading / 15) * 15 + offset + 360) % 360
      return <span key={offset} className={offset === 0 ? 'current' : ''}><span>{bearing === 0 ? 'N' : bearing === 90 ? 'E' : bearing === 180 ? 'S' : bearing === 270 ? 'W' : bearing.toString().padStart(3, '0')}</span><i /></span>
    })}</div>
    <div className="compass-cursor"><ChevronDown size={13} /><span>{heading.toString().padStart(3, '0')}°</span></div>
  </div>
}

function Radar({ state }: { state: GameSnapshot }) {
  return <div className="radar-panel">
    <div className="panel-heading"><span><Radio size={12} /> 战术雷达</span><span className="mono">4.5 KM</span></div>
    <div className="radar">
      <div className="radar-sweep" />
      <svg viewBox="0 0 180 180" aria-label="周围敌机相对位置">
        <defs><radialGradient id="radarGlow"><stop stopColor="#bddcd0" stopOpacity=".09" /><stop offset="1" stopColor="#bddcd0" stopOpacity="0" /></radialGradient></defs>
        <circle cx="90" cy="90" r="81" fill="url(#radarGlow)" />
        {[27, 54, 80].map(r => <circle key={r} cx="90" cy="90" r={r} stroke="currentColor" fill="none" strokeWidth=".6" opacity=".23" />)}
        <path d="M90 9v162M9 90h162M33 33l114 114M33 147 147 33" stroke="currentColor" strokeWidth=".5" opacity=".16" />
        <path d="m90 90-46-66M90 90l46-66" stroke="currentColor" strokeWidth=".7" opacity=".45" strokeDasharray="3 4" />
        <text x="90" y="7" textAnchor="middle">N</text><text x="174" y="94" textAnchor="middle">E</text>
        <text x="90" y="179" textAnchor="middle">S</text><text x="5" y="94" textAnchor="middle">W</text>
        <path d="m90 83-4 12 4-3 4 3Z" fill="#bce7dc" />
        {state.targets.filter(t => t.health > 0).map(target => <g key={target.id} transform={`translate(${90 + target.radarX * 77},${90 + target.radarY * 77})`}>
          {target.id === state.selectedTarget && <circle r="8" fill="none" stroke="#efb2a5" strokeWidth=".7" opacity=".65" />}
          <path d="m0-3.7 3.7 3.7L0 3.7-3.7 0Z" fill="#efb2a5" />
        </g>)}
      </svg>
    </div>
    <div className="radar-legend"><span><i className="friendly-dot" /> 友方</span><span><i className="enemy-dot" /> 敌方 <b>{3 - state.kills}</b></span><span className="mono">LINK 16</span></div>
  </div>
}

function TargetMarkers({ state, onSelect }: { state: GameSnapshot; onSelect: (id: number) => void }) {
  return <div className="target-layer">
    {state.targets.filter(target => target.health > 0).map(target => {
      const selected = target.id === state.selectedTarget
      const locked = selected && state.lock >= 1
      if (!target.visible) return selected && state.phase === 'playing' ? <div key={target.id} className="offscreen-target" data-distance={target.distance} style={{ '--bearing': `${target.bearing}deg` } as CSSProperties}>
        <span className="offscreen-arrow"><ChevronDown size={22} /></span><span>Su-35 · {(target.distance / 1000).toFixed(2)} KM{target.distance < 1000 && <small>近距缠斗 · 按 C 减速转弯</small>}</span>
      </div> : null
      return <button key={target.id} className={`target-marker ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`} data-distance={target.distance}
        style={{ left: `${target.x}%`, top: `${target.y}%` }} onClick={() => onSelect(target.id)} aria-label={`选择 ${target.name} Su-35 目标`}>
        <span className="target-name">{locked ? <span className="lock-word">LOCK</span> : selected ? 'TARGET' : ''}<b>Su-35</b></span>
        <span className="target-frame"><i /><i /><i /><i /><span className="target-diamond" />{selected && state.lock > 0 && state.lock < 1 && <svg viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" pathLength="100" strokeDasharray={`${state.lock * 100} 100`} /></svg>}</span>
        <span className="target-distance">{(target.distance / 1000).toFixed(2)} <small>KM</small></span>
        {selected && <span className="target-health"><i style={{ width: `${target.health}%` }} /></span>}
      </button>
    })}
  </div>
}

function FlightGauges({ state }: { state: GameSnapshot }) {
  return <>
    <div className={`flight-gauge speed-gauge ${state.boosting ? 'boosting' : ''}`}>
      <span className="gauge-label">{state.boosting ? 'AFTERBURNER' : 'AIRSPEED'}</span>
      <div className="gauge-reading"><span>{number(state.speed)}</span><i /></div><span className="gauge-unit">KM/H</span>
      <div className="gauge-ticks">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
    </div>
    <div className={`flight-gauge altitude-gauge ${state.lowAltitude ? 'danger' : ''}`}>
      <span className="gauge-label">ALTITUDE</span><div className="gauge-reading"><i /><span>{number(state.altitude)}</span></div><span className="gauge-unit">METERS</span>
      <div className="gauge-ticks">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
    </div>
    <div className={`aim-reticle ${state.lock >= 1 ? 'has-lock' : ''}`} style={{ left: `${state.aimX}%`, top: `${state.aimY}%` }}>
      <div className="aim-wings" style={{ transform: `rotate(${state.roll}deg)` }}><i /><span /><i /></div>
      <span className="aim-circle" /><span className="aim-dot" />
      <span className="aim-status">{state.phase === 'ready' ? 'WPN SAFE' : state.lock >= 1 ? 'SHOOT' : state.lock > 0 ? 'ACQUIRING' : 'WPN ARMED'}</span>
    </div>
  </>
}

function AircraftStatus({ state }: { state: GameSnapshot }) {
  return <div className={`aircraft-status ${state.health < 35 ? 'critical' : ''}`}>
    <div className="aircraft-status-top"><div><JetIcon /><span><b>RAPTOR <span>01</span></b><small>F-22A · 空中优势战斗机</small></span></div><span className="integrity-value"><Shield size={13} />{state.health}<small>%</small></span></div>
    <div className="integrity-bar">{Array.from({ length: 30 }, (_, i) => <i key={i} className={i < state.health / 100 * 30 ? 'filled' : ''} />)}</div>
    <div className="aircraft-status-bottom"><span>机体完整度</span><span><i className="status-dot" />{state.health < 35 ? 'CRITICAL' : state.health < 75 ? 'DAMAGED' : 'ALL SYSTEMS NOMINAL'}</span></div>
  </div>
}

function Weapons({ state, engine }: { state: GameSnapshot; engine: FlightEngine | null }) {
  const playing = state.phase === 'playing'
  const holdGun = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!playing) return
    event.currentTarget.setPointerCapture(event.pointerId)
    engine?.setVirtualInput({ gun: true })
  }
  return <div className="weapons-panel">
    <div className="panel-heading"><span><Crosshair size={12} /> 武器系统</span><span className={`weapon-arm ${playing ? 'armed' : ''}`}><i />{playing ? 'ARMED' : 'STANDBY'}</span></div>
    <button className={`weapon-slot missile-slot ${state.lock >= 1 && playing ? 'weapon-locked' : ''}`} onClick={() => engine?.fireMissile()} disabled={!playing || state.missiles === 0 || state.missileCooldown > 0} aria-label="发射 AIM-120C 导弹">
      <span className="weapon-symbol"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m32 6-5 4L12 25l-1 5 5-1L31 14Zm-9 9-7-2-4 4 6 3m7-1 2 7-4 4-3-6M12 25l-5 1-2 5 6-1m5-1-1 6-5 2 1-7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg></span>
      <span className="weapon-info"><b>AIM-120C</b><small>{state.missileCooldown > 0 ? `挂架准备 ${state.missileCooldown.toFixed(1)}s` : state.lock >= 1 && playing ? '目标锁定 · 可发射' : '中距空空导弹'}</small></span>
      <span className="ammo-count">{state.missiles.toString().padStart(2, '0')}<small>/ 12</small></span><span className="weapon-shortcut">↵</span>
    </button>
    <button className={`weapon-slot gun-slot ${state.overheated ? 'overheated' : ''}`} disabled={!playing} onPointerDown={holdGun} onPointerUp={() => engine?.setVirtualInput({ gun: false })} onPointerCancel={() => engine?.setVirtualInput({ gun: false })} onLostPointerCapture={() => engine?.setVirtualInput({ gun: false })} aria-label="按住发射 M61A2 机炮" onKeyDown={e => { if (e.code === 'Enter') { e.stopPropagation(); engine?.setVirtualInput({ gun: true }) } }} onKeyUp={() => engine?.setVirtualInput({ gun: false })} onBlur={() => engine?.setVirtualInput({ gun: false })}>
      <span className="weapon-symbol"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m13 30 14-17m-19 12 14-17m-9 22-5-5 5-6 5 5m8-12 5-6 3 3-5 6m-4-8 4-5 3 3-4 5M5 29l6 5" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg></span>
      <span className="weapon-info"><b>M61A2 VULCAN</b><small>{state.overheated ? '过热 · 冷却中' : '20mm 六管机炮'}</small></span><span className="ammo-count infinity">∞</span><span className="weapon-shortcut">␣</span>
      <span className="gun-heat"><i style={{ width: `${state.gunHeat * 100}%` }} /></span>
    </button>
    <button className="flare-button" disabled={!playing || state.flareCooldown > 0 || state.flares === 0} onClick={() => engine?.deployFlares()}><Sparkles size={13} /><span>{state.flareCooldown > 0 ? `干扰冷却 ${state.flareCooldown.toFixed(1)}s` : '热焰干扰弹'}</span><b>{state.flares.toString().padStart(2, '0')}</b><Key>F</Key></button>
  </div>
}

function TouchControls({ engine }: { engine: FlightEngine | null }) {
  const hold = (event: ReactPointerEvent<HTMLButtonElement>, input: Partial<FlightInput>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine?.setVirtualInput(input)
  }
  const release = (input: Partial<FlightInput>) => {
    const released: Partial<FlightInput> = {}
    if ('turn' in input) released.turn = 0
    if ('pitch' in input) released.pitch = 0
    if ('boost' in input) released.boost = false
    engine?.setVirtualInput(released)
  }
  return <div className="touch-controls">
    <div className="touch-dpad">{[
      { key: 'up', icon: <ArrowUp />, input: { pitch: 1 }, label: '拉升' },
      { key: 'left', icon: <ArrowLeft />, input: { turn: 1 }, label: '左转' },
      { key: 'down', icon: <ArrowDown />, input: { pitch: -1 }, label: '俯冲' },
      { key: 'right', icon: <ArrowRight />, input: { turn: -1 }, label: '右转' },
    ].map(button => <button key={button.key} className={`touch-${button.key}`} aria-label={button.label} onPointerDown={e => hold(e, button.input)} onPointerUp={() => release(button.input)} onPointerCancel={() => release(button.input)} onLostPointerCapture={() => release(button.input)}>{button.icon}</button>)}</div>
    <button className="touch-boost" aria-label="加力推进" onPointerDown={e => hold(e, { boost: true })} onPointerUp={() => release({ boost: true })} onPointerCancel={() => release({ boost: true })} onLostPointerCapture={() => release({ boost: true })}><Flame size={19} /></button>
  </div>
}

function Modal({ title, subtitle, children, onClose, wide = false, restoreFocus = true }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; wide?: boolean; restoreFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => { if (restoreFocus) previousFocus?.focus() }
  }, [])
  return <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref} onKeyDown={e => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Tab') {
        const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]') ?? []).filter(el => !(el as HTMLButtonElement).disabled)
        const first = elements[0], last = elements[elements.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }}>
      <div className="modal-header"><div><span className="eyebrow">{subtitle}</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭窗口"><X size={20} /></button></div>
      {children}
    </div>
  </div>
}

const controlRows = [
  { keys: ['W', 'S'], title: '上仰 / 俯冲', detail: '调整机头俯仰，改变飞行高度' },
  { keys: ['A', 'D'], title: '向左 / 向右转弯', detail: '倾斜机翼并改变航向' },
  { keys: ['SHIFT'], title: '加力推进', detail: '按住加速，快速接近或脱离敌机' },
  { keys: ['C'], title: '空气制动', detail: '按住减速，缩小转弯半径' },
  { keys: ['SPACE'], title: '发射机炮', detail: '按住连续射击，注意过热指示' },
  { keys: ['ENTER'], title: '发射导弹', detail: '目标进入前方 21°，持续锁定后发射' },
  { keys: ['Q'], title: '切换目标', detail: '也可点击敌机标记或目标列表' },
  { keys: ['F'], title: '释放热焰干扰', detail: '打断来袭导弹的制导，冷却 4 秒' },
  { keys: ['ESC', 'P'], title: '暂停 / 继续', detail: '离开页面时自动暂停' },
]

export default function App() {
  const mount = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLElement>(null)
  const engine = useRef<FlightEngine | null>(null)
  const [state, setState] = useState<GameSnapshot>(initialSnapshot)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalName>(null)
  const [sound, setSound] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [settings, setSettings] = useState<EngineSettings>({ controlMode: 'keyboard', quality: 'high', sensitivity: 1, invertY: false })
  const [bestScore, setBestScore] = useState(() => { try { return Number(localStorage.getItem('aether-best-score')) || 0 } catch { return 0 } })
  const resumeOnClose = useRef(false)

  useEffect(() => {
    if (!mount.current) return
    let active: FlightEngine | null = null
    try {
      active = new FlightEngine(mount.current, setState, setError)
      engine.current = active
      setLoaded(true)
    } catch (error) {
      console.error('Unable to initialize flight scene:', error)
      setError('此设备暂时无法启动 3D 空域。请使用支持 WebGL 的浏览器，并开启图形加速。')
    }
    return () => { active?.dispose(); engine.current = null }
  }, [])

  useEffect(() => {
    if (state.phase === 'victory' && state.score > bestScore) {
      setBestScore(state.score)
      try { localStorage.setItem('aether-best-score', String(state.score)) } catch { /* Storage is optional. */ }
    }
  }, [state.phase, state.score, bestScore])

  useEffect(() => { if (feedback) { const timer = window.setTimeout(() => setFeedback(''), 3500); return () => clearTimeout(timer) } }, [feedback])
  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  const openModal = (name: ModalName) => {
    resumeOnClose.current = engine.current?.simulation.phase === 'playing'
    engine.current?.pause(); setModal(name)
  }
  const closeModal = useCallback(() => {
    setModal(null)
    if (resumeOnClose.current) engine.current?.resume()
    resumeOnClose.current = false
  }, [])
  const updateSettings = (patch: Partial<EngineSettings>) => { setSettings(current => ({ ...current, ...patch })); engine.current?.setSettings(patch) }
  const toggleSound = () => { setSound(current => { engine.current?.setSound(!current); return !current }) }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen()
      else setFeedback('此浏览器不支持全屏模式；横屏可获得更大的飞行视野。')
    } catch { setFeedback('暂时无法进入全屏，请重试。') }
  }
  const ready = state.phase === 'ready'
  const playing = state.phase === 'playing'
  const finished = state.phase === 'victory' || state.phase === 'defeat'

  return <div className="app">
    <header className="site-header">
      <button className="brand" onClick={() => { if (state.phase === 'ready') return; engine.current?.pause(); }} aria-label="AETHER 空战纪元"><Logo /><span>AETHER<small>空 战 纪 元</small></span></button>
      <nav className="main-nav" aria-label="主导航"><button className={!modal ? 'active' : ''} onClick={() => { if (modal) closeModal() }}><span />作战空域</button><button className={modal === 'aircraft' ? 'active' : ''} onClick={() => openModal('aircraft')}>机体档案</button><button className={modal === 'help' ? 'active' : ''} onClick={() => openModal('help')}>飞行指南<ArrowUpRight size={12} /></button></nav>
      <div className="header-right"><span className="system-status"><i className="status-dot" />SYSTEM ONLINE</span><div className="header-tools"><button className={`icon-button ${!sound ? 'muted' : ''}`} onClick={toggleSound} aria-label={sound ? '关闭声音' : '开启声音'} title={sound ? '关闭声音' : '开启声音'}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button className="icon-button" onClick={() => openModal('settings')} aria-label="游戏设置" title="游戏设置"><Settings2 size={17} /></button></div></div>
    </header>

    <div className="mission-toolbar">
      <div className="mission-title"><span className="section-number">01<span>/</span></span><div><div className="toolbar-eyebrow">TACTICAL OPERATIONS</div><h2>作战空域 <span className="live-badge"><i />LIVE</span></h2></div><div className="mission-location"><MapPin size={14} /><span>挪威海<span>北部空域 · SECTOR 07</span></span></div></div>
      <div className="mission-toolbar-right"><span className="mode-label"><i />单人战役</span><span className="mission-clock"><span>MISSION TIME</span><b>{formatTime(state.elapsed)}</b></span><button className="expand-button" onClick={toggleFullscreen} aria-label="切换全屏"><Expand size={15} /><span>全屏视野</span></button></div>
    </div>

    <main className={`stage ${ready ? 'is-ready' : 'is-active'} ${state.incoming ? 'under-threat' : ''}`} ref={stage} aria-label="空战游戏">
      <div className="scene-container" ref={mount} />
      <div className="scene-vignette" />
      <div className="stage-top-line"><span /><span /><span /></div>
      {fullscreen && <button className="stage-fullscreen-exit" onClick={toggleFullscreen} aria-label="退出全屏"><Minimize size={13} /><span>退出全屏</span></button>}
      <div className="sector-label"><i /> NORTH ATLANTIC AIRSPACE <span> / </span> 68°32′ N &nbsp; 12°48′ E</div>
      <Compass heading={state.heading} />

      <section className={`mission-hero ${ready ? '' : 'compact'}`}>
        <div className="hero-eyebrow"><span /> OPERATION 01 <span className="hero-divider">/</span> AIR SUPERIORITY</div>
        <h1>霁蓝边界<span>THE PALE HORIZON</span></h1>
        {ready ? <div className="briefing-content"><p>云海之上，天空属于你。</p><span className="briefing-detail">驾驶 F-22 猛禽，夺取这片空域的制空权。</span><button className="engage-button" onClick={() => engine.current?.start()} disabled={!loaded || !!error}><Play size={15} fill="currentColor" /><span>{loaded ? '进入空域' : '连接空域'}<small>ENGAGE</small></span><ArrowRight size={17} /></button><span className="launch-note"><Shield size={11} /> 空中部署 · 即刻交战</span></div> : <div className="mission-live"><i className="status-dot" />{state.phase === 'playing' ? '任务进行中' : state.phase === 'paused' ? '任务已暂停' : '任务已结束'}<span>{formatTime(state.elapsed)}</span><button onClick={() => engine.current?.togglePause()} aria-label={playing ? '暂停游戏' : '继续游戏'} disabled={finished}>{playing ? <Pause size={12} /> : <Play size={12} />}</button></div>}
      </section>

      <div className="objective-panel">
        <div className="panel-heading"><span><Target size={13} /> 作战目标</span><span className="mono">OBJ—01</span></div>
        <div className="objective-summary"><span>清除敌方编队<small>建立区域制空权</small></span><span className="objective-count">{state.kills.toString().padStart(2, '0')}<small>/ 03</small></span></div>
        <div className="enemy-list">{[0, 1, 2].map(id => {
          const target = state.targets.find(t => t.id === id)
          const destroyed = target?.health === 0
          return <button className={`${id === state.selectedTarget ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}`} key={id} disabled={destroyed} onClick={() => engine.current?.selectTarget(id)} aria-label={`锁定 VIPER 0${id + 1}`}><span className="enemy-diamond" /><span>Su-35 <small>VIPER 0{id + 1}</small></span><span>{destroyed ? '已击落' : id === state.selectedTarget ? <Crosshair size={13} /> : '敌对'}</span></button>
        })}</div>
      </div>

      <div className="weather-indicator"><Wind size={15} /><span>17:42 <i /> 薄云<span>VISIBILITY UNLIMITED</span></span></div>
      <FlightGauges state={state} />
      <TargetMarkers state={state} onSelect={id => engine.current?.selectTarget(id)} />
      {state.incoming && playing && <div className="missile-alert" role="alert"><Target size={15} /><span>MISSILE ALERT</span><span>按 <Key>F</Key> 释放干扰</span></div>}
      {state.message && !ready && <div className={`radio-message ${state.messageType}`} role="status"><AudioLines size={15} /><span>{state.message}</span></div>}

      <Radar state={state} />
      <AircraftStatus state={state} />
      <Weapons state={state} engine={engine.current} />
      {playing && <TouchControls engine={engine.current} />}
      <div className="stage-bottom-label"><span>AETHER FLIGHT SYSTEMS™</span><span>F-22A / BLOCK 35</span></div>

      {state.phase === 'paused' && !modal && !error && <div className="game-overlay"><section className="result-card pause-card" aria-label="游戏已暂停"><span className="result-icon"><Pause size={26} /></span><span className="eyebrow">MISSION ON HOLD</span><h2>保持航向。</h2><p>空域已暂停。准备好了，继续这场战斗。</p><div className="pause-stats"><span>飞行时间<b>{formatTime(state.elapsed)}</b></span><span>已击落<b>{state.kills} / 3</b></span><span>机体状态<b>{state.health}%</b></span></div><button className="engage-button" onClick={() => engine.current?.resume()}><Play size={15} fill="currentColor" /><span>继续作战</span><ArrowRight size={17} /></button><button className="text-button" onClick={() => engine.current?.reset()}><RotateCcw size={13} />返回任务简报</button></section></div>}
      {finished && !modal && <div className="game-overlay"><section className={`result-card ${state.phase === 'victory' ? 'victory' : 'defeat'}`} aria-label={state.phase === 'victory' ? '任务完成' : '任务失败'}><span className="result-icon">{state.phase === 'victory' ? <Trophy size={29} /> : <Shield size={29} />}</span><span className="eyebrow">{state.phase === 'victory' ? 'AIR SUPERIORITY ACHIEVED' : 'AIRCRAFT LOST'}</span><h2>{state.phase === 'victory' ? '天空，属于你。' : '下次，再征服天空。'}</h2><p>{state.phase === 'victory' ? '敌方编队已清除。猛禽，欢迎凯旋。' : state.message || '机体已损失，重新部署后再次出击。'}</p><div className="result-score"><span>MISSION SCORE</span><strong>{number(state.score)}</strong>{state.score > 0 && state.score >= bestScore && <span className="new-best">PERSONAL BEST</span>}</div><div className="pause-stats"><span>飞行时间<b>{formatTime(state.elapsed)}</b></span><span>确认击落<b>{state.kills} / 3</b></span><span>机体完整<b>{state.health}%</b></span></div><button className="engage-button" onClick={() => engine.current?.start()}><RotateCcw size={16} /><span>再次出击</span><ArrowRight size={17} /></button><button className="text-button" onClick={() => engine.current?.reset()}>返回空域简报</button></section></div>}
      {error && <div className="game-overlay"><section className="result-card error-card"><Gauge size={32} /><h2>空域连接中断</h2><p>{error}</p><button className="engage-button" onClick={() => window.location.reload()}><RotateCcw size={15} /><span>重新载入</span></button></section></div>}
      {feedback && <div className="feedback-toast" role="status">{feedback}</div>}
    </main>

    <footer className="controls-footer"><div className="control-intro"><Keyboard size={15} /><span>{settings.controlMode === 'mouse' ? '鼠标操纵' : '飞行控制'}</span><i /></div><div className="controls-row"><span><span className="keys-group"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span> 飞行</span><span><Key wide>SHIFT</Key> 加力</span><span><Key wide>SPACE</Key> 机炮</span><span><Key wide>ENTER</Key> 导弹</span><span><Key>Q</Key> 切换目标</span><span><Key>F</Key> 干扰弹</span><span><Key wide>ESC</Key> 暂停</span></div><button className="footer-help" onClick={() => openModal('help')}><CircleHelp size={14} /><span>操作指南</span></button><span className="footer-version">FLIGHT BUILD 1.0</span></footer>

    {modal === 'help' && <Modal title="每一位王牌，都从这里开始。" subtitle="FLIGHT MANUAL / 01" onClose={closeModal} restoreFocus={!resumeOnClose.current} wide><div className="help-tip"><Crosshair size={23} /><div><b>追踪。锁定。发射。</b><p>把敌机保持在准星附近，锁定框变为绿色后按 Enter。两枚 AIM-120C 即可击落一架 Su-35；1.7 km 内也可使用机炮。注意来袭导弹，及时按 F 规避。</p></div></div><div className="controls-table">{controlRows.map(row => <div key={row.title}><span>{row.keys.map(key => <Key wide={key.length > 1} key={key}>{key}</Key>)}</span><span><b>{row.title}</b><small>{row.detail}</small></span></div>)}</div><div className="manual-bottom"><MousePointer2 size={14} /><span>可在设置中启用鼠标操纵。触屏设备提供方向和武器按钮。</span></div><button className="engage-button modal-primary" onClick={closeModal}><span>准备就绪</span><ArrowRight size={16} /></button></Modal>}

    {modal === 'aircraft' && <Modal title="为天空而生。" subtitle="AIRFRAME INTELLIGENCE / 02" onClose={closeModal} restoreFocus={!resumeOnClose.current} wide><div className="aircraft-files"><article className="aircraft-file raptor-file"><span className="file-badge">YOUR AIRCRAFT</span><div className="blueprint"><div className="blueprint-grid" /><JetIcon /><span className="blueprint-length">18.9 M</span><span className="blueprint-width">13.6 M</span></div><span className="file-manufacturer">LOCKHEED MARTIN</span><h3>F-22 <span>RAPTOR</span></h3><p>第五代隐身制空战斗机。菱形机翼与双发矢量推力，为超机动空战而生。</p><dl><div><dt>角色</dt><dd>玩家 · RAPTOR 01</dd></div><div><dt>动力</dt><dd>2 × F119-PW-100</dd></div><div><dt>导弹配置</dt><dd>12 × AIM-120C</dd></div><div><dt>固定武器</dt><dd>M61A2 · 20 mm</dd></div></dl></article><article className="aircraft-file flanker-file"><span className="file-badge">HOSTILE AIRCRAFT</span><div className="blueprint"><div className="blueprint-grid" /><JetIcon enemy /><span className="blueprint-length">21.9 M</span><span className="blueprint-width">15.3 M</span></div><span className="file-manufacturer">SUKHOI</span><h3>Su-35 <span>FLANKER-E</span></h3><p>重型多用途战斗机。凭借灵活的转向与追踪导弹，构成不可轻视的空中威胁。</p><dl><div><dt>角色</dt><dd>敌方 · VIPER 编队</dd></div><div><dt>动力</dt><dd>2 × AL-41F1S</dd></div><div><dt>编队规模</dt><dd>3 架</dd></div><div><dt>战术特征</dt><dd>追击 / 规避 / 导弹攻击</dd></div></dl></article></div><div className="file-note"><Radio size={13} /> 本任务采用街机飞行与武器配置，专注空中战斗体验。</div></Modal>}

    {modal === 'settings' && <Modal title="调整你的飞行方式。" subtitle="FLIGHT CONFIGURATION / 03" onClose={closeModal} restoreFocus={!resumeOnClose.current}><div className="settings-content"><div className="setting-row"><div><b>操纵方式</b><small>键盘始终可用，鼠标移至中心可平飞</small></div><div className="segmented"><button className={settings.controlMode === 'keyboard' ? 'active' : ''} onClick={() => updateSettings({ controlMode: 'keyboard' })}><Keyboard size={15} />键盘</button><button className={settings.controlMode === 'mouse' ? 'active' : ''} onClick={() => updateSettings({ controlMode: 'mouse' })}><MousePointer2 size={15} />鼠标</button></div></div><div className="setting-row"><div><b>鼠标灵敏度</b><small>决定鼠标操纵时的转向幅度</small></div><label className="range-control"><input aria-label="鼠标灵敏度" type="range" min="0.4" max="1.8" step="0.1" value={settings.sensitivity} onChange={e => updateSettings({ sensitivity: Number(e.target.value) })} /><span>{settings.sensitivity.toFixed(1)}×</span></label></div><div className="setting-row"><div><b>反转俯仰</b><small>反转键盘和鼠标的上仰 / 俯冲方向</small></div><button className={`toggle-switch ${settings.invertY ? 'on' : ''}`} role="switch" aria-checked={settings.invertY} aria-label="反转俯仰" onClick={() => updateSettings({ invertY: !settings.invertY })}><i /></button></div><div className="setting-row"><div><b>渲染质量</b><small>流畅模式适合移动设备和集成显卡</small></div><div className="segmented"><button className={settings.quality === 'high' ? 'active' : ''} onClick={() => updateSettings({ quality: 'high' })}><Sparkles size={14} />精致</button><button className={settings.quality === 'balanced' ? 'active' : ''} onClick={() => updateSettings({ quality: 'balanced' })}><Zap size={14} />流畅</button></div></div><div className="setting-row"><div><b>战场音效</b><small>引擎、武器与战术警报</small></div><button className={`toggle-switch ${sound ? 'on' : ''}`} role="switch" aria-checked={sound} aria-label="战场音效" onClick={toggleSound}><i /></button></div></div><div className="settings-note"><Shield size={14} /><span>调整期间战斗暂停，关闭后自动恢复。</span></div><button className="engage-button modal-primary" onClick={closeModal}><span>保存并返回</span><ArrowRight size={16} /></button></Modal>}
  </div>
}
