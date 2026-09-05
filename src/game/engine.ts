import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createAircraft, updateEngineFlames } from './aircraft'
import { CombatAudio } from './audio'
import { createWorld, makeCloudTexture } from './world'
import { FlightSimulation, FORWARD, UP } from './simulation'
import type { CombatEvent } from './simulation'
import type { ControlMode, FlightInput, GameSnapshot, Quality } from './types'
import { neutralInput } from './types'

interface Particle {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  life: number
  total: number
  size: number
  smoke: boolean
}

class Trail {
  private positions: THREE.Vector3[] = []
  private geometry = new THREE.BufferGeometry()
  private buffer: Float32Array
  readonly line: THREE.Line

  constructor(private max: number, color: string, opacity: number) {
    this.buffer = new Float32Array(max * 3)
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer, 3))
    const ages = new Float32Array(max)
    for (let i = 0; i < max; i++) ages[i] = i / (max - 1)
    this.geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1))
    this.line = new THREE.Line(this.geometry, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      transparent: true, depthWrite: false,
      vertexShader: `attribute float age; varying float vAge; void main(){vAge=age;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vAge; void main(){gl_FragColor=vec4(uColor,uOpacity*pow(1.-vAge,1.4));}`,
    }))
    this.line.frustumCulled = false
  }

  update(position: THREE.Vector3) {
    this.positions.unshift(position.clone())
    if (this.positions.length > this.max) this.positions.pop()
    for (let i = 0; i < this.positions.length; i++) this.positions[i].toArray(this.buffer, i * 3)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, this.positions.length)
  }

  clear() { this.positions = []; this.geometry.setDrawRange(0, 0) }
  dispose() { this.line.removeFromParent(); this.geometry.dispose(); (this.line.material as THREE.Material).dispose() }
}

export interface EngineSettings { controlMode: ControlMode; quality: Quality; sensitivity: number; invertY: boolean }

export class FlightEngine {
  readonly simulation = new FlightSimulation()
  readonly audio = new CombatAudio()
  readonly renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(54, 1, 0.8, 180000)
  private player = createAircraft('f22')
  private enemyModels = [createAircraft('su35'), createAircraft('su35'), createAircraft('su35')]
  private world: ReturnType<typeof createWorld>
  private keys = new Set<string>()
  private mouse = { x: 0, y: 0 }
  private virtual: FlightInput = { ...neutralInput }
  private settings: EngineSettings = { controlMode: 'keyboard', quality: 'high', sensitivity: 1, invertY: false }
  private observer: ResizeObserver
  private frameId = 0
  private previousTime = 0
  private worldTime = 0
  private snapshotTimer = 0
  private particles: Particle[] = []
  private projectileMeshes = new Map<number, { mesh: THREE.Group; trail: Trail }>()
  private bulletMeshes = new Map<number, THREE.Line>()
  private wingTrails = [new Trail(100, '#ebf4ff', 0.42), new Trail(100, '#ebf4ff', 0.42)]
  private explosionTexture = this.createSparkTexture()
  private smokeTexture = makeCloudTexture(200)
  private shake = 0
  private disposed = false
  private readyCamera = true
  private cameraOffset = new THREE.Vector3(11, 12, 27)

  constructor(private container: HTMLDivElement, private onSnapshot: (snapshot: GameSnapshot) => void, private onError: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.setAttribute('aria-label', 'F-22 三维空战场景')
    this.renderer.domElement.setAttribute('role', 'application')
    this.renderer.domElement.tabIndex = 0
    this.container.appendChild(this.renderer.domElement)
    const environmentGenerator = new THREE.PMREMGenerator(this.renderer)
    const environmentScene = new RoomEnvironment()
    this.scene.environment = environmentGenerator.fromScene(environmentScene, 0.04).texture
    this.scene.environmentIntensity = 0.65
    environmentScene.dispose()
    environmentGenerator.dispose()
    this.world = createWorld(this.scene)
    this.scene.add(this.player, ...this.enemyModels)
    this.enemyModels.forEach(model => model.scale.setScalar(1.2))
    this.wingTrails.forEach(trail => this.scene.add(trail.line))
    this.player.position.copy(this.simulation.position)
    this.camera.position.copy(this.simulation.position).add(new THREE.Vector3(10, 7, 23))
    this.camera.lookAt(this.simulation.position.clone().add(new THREE.Vector3(0, 1.7, -22)))
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(container)
    this.resize()
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
    container.addEventListener('pointermove', this.pointerMove)
    container.addEventListener('pointerleave', this.pointerLeave)
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    this.frameId = requestAnimationFrame(this.frame)
  }

  private resize = () => {
    const width = this.container.clientWidth, height = this.container.clientHeight
    if (!width || !height) return
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  start = () => {
    this.simulation.start()
    this.clearEffects()
    this.readyCamera = true
    this.keys.clear(); this.virtual = { ...neutralInput }; this.mouse = { x: 0, y: 0 }
    void this.audio.unlock()
    this.focusFlight()
    this.emitSnapshot()
  }

  reset = () => {
    this.simulation.reset()
    this.clearEffects()
    this.readyCamera = true
    this.keys.clear(); this.virtual = { ...neutralInput }; this.mouse = { x: 0, y: 0 }
    this.emitSnapshot()
  }

  togglePause = () => {
    if (this.simulation.phase === 'playing') this.pause()
    else if (this.simulation.phase === 'paused') this.resume()
  }

  pause = () => {
    if (this.simulation.phase !== 'playing') return
    this.simulation.phase = 'paused'
    this.keys.clear(); this.virtual = { ...neutralInput }; this.mouse = { x: 0, y: 0 }
    this.emitSnapshot()
  }

  resume = () => {
    if (this.simulation.phase !== 'paused') return
    this.simulation.phase = 'playing'
    this.keys.clear()
    void this.audio.unlock()
    this.focusFlight()
    this.emitSnapshot()
  }

  fireMissile = () => { this.simulation.fireMissile(); this.emitSnapshot() }
  deployFlares = () => { this.simulation.deployFlares(); this.emitSnapshot() }
  selectTarget = (id?: number) => { this.simulation.selectTarget(id); this.emitSnapshot() }
  setVirtualInput = (input: Partial<FlightInput>) => { this.virtual = { ...this.virtual, ...input } }
  setSound = (enabled: boolean) => { this.audio.setEnabled(enabled); if (enabled) void this.audio.unlock() }
  setSettings = (settings: Partial<EngineSettings>) => {
    this.settings = { ...this.settings, ...settings }
    this.mouse = { x: 0, y: 0 }
    if (settings.quality) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.quality === 'high' ? 1.75 : 1))
      this.world.setQuality(settings.quality === 'high')
      this.resize()
    }
  }

  private focusFlight() {
    if (!this.disposed && this.simulation.phase === 'playing') this.renderer.domElement.focus({ preventScroll: true })
    requestAnimationFrame(() => {
      if (!this.disposed && this.simulation.phase === 'playing') this.renderer.domElement.focus({ preventScroll: true })
    })
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return
    const actions = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyF', 'KeyQ', 'KeyP', 'Escape']
    if (!actions.includes(event.code)) return
    if (this.simulation.phase === 'playing') event.preventDefault()
    if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) { this.togglePause(); return }
    if (this.simulation.phase !== 'playing') return
    this.keys.add(event.code)
    if (event.repeat) return
    if (event.code === 'Enter') this.fireMissile()
    if (event.code === 'KeyF') this.deployFlares()
    if (event.code === 'KeyQ') this.selectTarget()
  }
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code) }
  private onBlur = () => { this.pause(); this.keys.clear() }
  private onVisibility = () => { if (document.hidden) this.pause() }
  private pointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || this.settings.controlMode !== 'mouse' || this.simulation.phase !== 'playing') return
    const rect = this.container.getBoundingClientRect()
    this.mouse.x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2.5, -1, 1)
    this.mouse.y = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2.5, -1, 1)
  }
  private pointerLeave = () => { this.mouse = { x: 0, y: 0 } }
  private contextLost = (event: Event) => { event.preventDefault(); this.pause(); this.onError('图形连接已中断。请重新载入空域以恢复游戏。') }

  private input(): FlightInput {
    const pressed = (...codes: string[]) => codes.some(code => this.keys.has(code)) ? 1 : 0
    const mouseMode = this.settings.controlMode === 'mouse'
    const mx = Math.abs(this.mouse.x) < 0.05 ? 0 : -this.mouse.x * this.settings.sensitivity
    const my = Math.abs(this.mouse.y) < 0.05 ? 0 : -this.mouse.y * this.settings.sensitivity * (this.settings.invertY ? -1 : 1)
    return {
      turn: THREE.MathUtils.clamp(pressed('KeyA', 'ArrowLeft') - pressed('KeyD', 'ArrowRight') + this.virtual.turn + (mouseMode ? mx : 0), -1, 1),
      pitch: THREE.MathUtils.clamp((pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown')) * (this.settings.invertY ? -1 : 1) + this.virtual.pitch + (mouseMode ? my : 0), -1, 1),
      boost: !!pressed('ShiftLeft', 'ShiftRight') || this.virtual.boost,
      brake: !!pressed('KeyC') || this.virtual.brake,
      gun: !!pressed('Space') || this.virtual.gun,
    }
  }

  private frame = (now: number) => {
    if (this.disposed) return
    const dt = this.previousTime ? Math.min((now - this.previousTime) / 1000, 0.05) : 1 / 60
    this.previousTime = now
    const sim = this.simulation
    if (sim.phase !== 'paused') this.worldTime += dt
    if (sim.phase === 'playing') {
      const input = this.input()
      let remaining = dt
      while (remaining > 0.0001) { const step = Math.min(remaining, 1 / 120); sim.step(step, input); remaining -= step }
    }
    this.updateCamera(dt)
    this.player.position.copy(sim.position)
    this.player.quaternion.copy(sim.quaternion)
    if (sim.phase === 'ready') {
      this.player.rotation.x = 0.17
      this.player.rotation.z = -0.08 + Math.sin(this.worldTime * 0.32) * 0.018
      this.player.position.y += Math.sin(this.worldTime * 0.65) * 0.09
    }
    this.player.scale.setScalar(sim.phase === 'ready' ? 1.1 : 1)
    this.player.visible = sim.phase !== 'defeat'
    updateEngineFlames(this.player, this.worldTime, sim.boosting)
    sim.enemies.forEach((enemy, i) => {
      const model = this.enemyModels[i]
      model.visible = enemy.health > 0
      model.position.copy(enemy.position)
      model.quaternion.setFromUnitVectors(FORWARD, enemy.direction)
      model.rotateZ(enemy.roll)
      updateEngineFlames(model, this.worldTime, false)
    })
    if (sim.phase === 'playing') {
      this.wingTrails.forEach((trail, i) => trail.update(new THREE.Vector3(i ? 6.7 : -6.7, 0, 2.1).applyQuaternion(sim.quaternion).add(sim.position)))
    }
    for (const event of sim.events.splice(0)) this.handleEvent(event)
    if (sim.phase !== 'paused') { this.updateParticles(dt); this.updateProjectiles() }
    this.world.update(this.worldTime, this.camera.position, sim.position)
    this.audio.update(sim.phase === 'playing', sim.boosting)
    this.renderer.render(this.scene, this.camera)
    this.snapshotTimer += dt
    if (this.snapshotTimer >= 1 / 15) { this.snapshotTimer = 0; this.emitSnapshot() }
    this.frameId = requestAnimationFrame(this.frame)
  }

  private updateCamera(dt: number) {
    const sim = this.simulation
    if (sim.phase === 'paused') return
    const ready = sim.phase === 'ready'
    const offset = ready ? new THREE.Vector3(11 + Math.sin(this.worldTime * 0.09) * 0.9, 6.5, 27) : new THREE.Vector3(0, 7.6, 26)
    offset.multiplyScalar(Math.max(1, Math.min(2, 1.05 / this.camera.aspect)))
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(sim.pitch * 0.83, sim.heading, sim.roll * 0.085, 'YXZ'))
    offset.applyQuaternion(orientation)
    this.cameraOffset.lerp(offset, this.readyCamera ? 1 : 1 - Math.exp(-dt * 7))
    this.camera.position.copy(sim.position).add(this.cameraOffset)
    this.readyCamera = false
    const target = sim.position.clone().addScaledVector(sim.forward, ready ? 16 : 25).addScaledVector(UP, ready ? 0.7 : 1.4)
    if (ready) target.x -= 6.5
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2)
      this.camera.position.x += (Math.random() - 0.5) * this.shake
      this.camera.position.y += (Math.random() - 0.5) * this.shake
    }
    this.camera.up.copy(UP).applyAxisAngle(sim.forward, sim.roll * 0.08)
    this.camera.lookAt(target)
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, ready ? 54 : sim.boosting ? 66 : 57, 2, dt)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  private emitSnapshot() {
    const sim = this.simulation
    const aim = sim.position.clone().addScaledVector(sim.forward, 10000).project(this.camera)
    this.onSnapshot({
      phase: sim.phase, speed: Math.round(sim.speed * 3.6), altitude: Math.round(sim.position.y),
      heading: (Math.round(-sim.heading * 180 / Math.PI) % 360 + 360) % 360,
      pitch: sim.pitch * 180 / Math.PI, roll: sim.roll * 180 / Math.PI,
      aimX: (aim.x + 1) * 50, aimY: (1 - aim.y) * 50,
      health: sim.health, missiles: sim.missilesLeft, flares: sim.flaresLeft,
      flareCooldown: sim.flareCooldown, gunHeat: sim.gunHeat, overheated: sim.overheated,
      missileCooldown: sim.missileCooldown, lock: sim.lock, selectedTarget: sim.selectedTarget,
      kills: sim.kills, score: sim.score, elapsed: sim.elapsed, boosting: sim.boosting,
      incoming: sim.incoming, lowAltitude: sim.lowAltitude, message: sim.message, messageType: sim.messageType,
      targets: sim.enemies.map(enemy => {
        const relative = enemy.position.clone().sub(sim.position).applyAxisAngle(UP, -sim.heading)
        const projected = enemy.position.clone().project(this.camera)
        return {
          id: enemy.id, name: enemy.name, health: enemy.health, distance: enemy.position.distanceTo(sim.position),
          visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.86 && Math.abs(projected.y) < 0.77,
          x: THREE.MathUtils.clamp((projected.x + 1) * 50, 6, 94),
          y: THREE.MathUtils.clamp((1 - projected.y) * 50, 16, 79),
          bearing: Math.atan2(relative.x, -relative.z) * 180 / Math.PI,
          radarX: THREE.MathUtils.clamp(relative.x / 4500, -0.86, 0.86),
          radarY: THREE.MathUtils.clamp(relative.z / 4500, -0.86, 0.86),
        }
      }),
    })
  }

  private createSparkTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,240,1)'); gradient.addColorStop(0.12, 'rgba(255,234,189,1)')
    gradient.addColorStop(0.35, 'rgba(255,145,66,.6)'); gradient.addColorStop(1, 'rgba(255,62,12,0)')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  private handleEvent(event: CombatEvent) {
    this.audio.play(event.type)
    if (event.type === 'kill' || event.type === 'hit' || event.type === 'damage') {
      if (event.type === 'damage') this.shake = 2.5
      const big = event.type === 'kill'
      this.burst(event.position, big ? 34 : 9, big ? 120 : 26)
    }
    if (event.type === 'flare') {
      for (let i = 0; i < 18; i++) {
        const direction = new THREE.Vector3((i % 2 ? 1 : -1) * (30 + Math.random() * 65), -8 - Math.random() * 35, 15 + Math.random() * 35)
        direction.applyQuaternion(this.simulation.quaternion)
        this.addParticle(event.position, direction, 3 + Math.random(), 7 + Math.random() * 5, false)
      }
    }
  }

  private addParticle(position: THREE.Vector3, velocity: THREE.Vector3, life: number, size: number, smoke: boolean) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smoke ? this.smokeTexture : this.explosionTexture, transparent: true, depthWrite: false,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending, color: smoke ? '#5d6478' : '#fff3e5',
    }))
    sprite.position.copy(position); sprite.scale.setScalar(size)
    this.scene.add(sprite)
    this.particles.push({ sprite, velocity, life, total: life, size, smoke })
  }

  private burst(position: THREE.Vector3, count: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).multiplyScalar(radius)
      this.addParticle(position, velocity, 0.65 + Math.random() * (i % 3 ? 1 : 3), (i % 3 ? radius * 0.65 : radius * 1.4), i % 3 === 0)
    }
  }

  private updateParticles(dt: number) {
    this.particles = this.particles.filter(particle => {
      particle.life -= dt
      if (particle.life <= 0) { particle.sprite.removeFromParent(); particle.sprite.material.dispose(); return false }
      particle.sprite.position.addScaledVector(particle.velocity, dt)
      particle.velocity.multiplyScalar(1 - dt * 0.25)
      const progress = 1 - particle.life / particle.total
      particle.sprite.scale.setScalar(particle.size * (1 + progress * (particle.smoke ? 2.5 : 0.8)))
      particle.sprite.material.opacity = Math.min(1, particle.life) * (particle.smoke ? 0.42 : 0.9)
      return true
    })
  }

  private updateProjectiles() {
    const ids = new Set(this.simulation.missiles.map(missile => missile.id))
    for (const [id, item] of this.projectileMeshes) if (!ids.has(id)) {
      item.mesh.removeFromParent(); this.disposeGroup(item.mesh); item.trail.dispose(); this.projectileMeshes.delete(id)
    }
    for (const missile of this.simulation.missiles) {
      let item = this.projectileMeshes.get(missile.id)
      if (!item) {
        const mesh = new THREE.Group()
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.6, 6), new THREE.MeshBasicMaterial({ color: '#f1eee9' }))
        body.rotation.x = Math.PI / 2; mesh.add(body)
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.explosionTexture, color: missile.friendly ? '#ffca98' : '#ff6f59', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
        glow.scale.setScalar(9); glow.position.z = 2; mesh.add(glow)
        const trail = new Trail(70, missile.friendly ? '#edf1f4' : '#efbbab', 0.8)
        item = { mesh, trail }; this.projectileMeshes.set(missile.id, item)
        this.scene.add(mesh, trail.line)
      }
      item.mesh.position.copy(missile.position)
      item.mesh.quaternion.setFromUnitVectors(FORWARD, missile.direction)
      item.trail.update(missile.position)
    }
    const bulletIds = new Set(this.simulation.bullets.map(bullet => bullet.id))
    for (const [id, mesh] of this.bulletMeshes) if (!bulletIds.has(id)) {
      mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); this.bulletMeshes.delete(id)
    }
    for (const bullet of this.simulation.bullets) {
      let mesh = this.bulletMeshes.get(bullet.id)
      if (!mesh) {
        mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#fff0bb', transparent: true, opacity: 0.95 }))
        mesh.frustumCulled = false
        this.bulletMeshes.set(bullet.id, mesh); this.scene.add(mesh)
      }
      const positions = mesh.geometry.getAttribute('position')
      positions.setXYZ(0, ...bullet.position.toArray() as [number, number, number])
      const tail = bullet.position.clone().addScaledVector(bullet.direction, -85)
      positions.setXYZ(1, ...tail.toArray() as [number, number, number])
      positions.needsUpdate = true
    }
  }

  private disposeGroup(group: THREE.Object3D, textures = false) {
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if ('geometry' in object) object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (textures) for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
          material.dispose()
        }
      }
    })
  }

  private clearEffects() {
    this.particles.forEach(p => { p.sprite.removeFromParent(); p.sprite.material.dispose() }); this.particles = []
    this.projectileMeshes.forEach(item => { item.mesh.removeFromParent(); this.disposeGroup(item.mesh); item.trail.dispose() }); this.projectileMeshes.clear()
    this.bulletMeshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }); this.bulletMeshes.clear()
    this.wingTrails.forEach(trail => trail.clear())
    this.shake = 0
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    this.observer.disconnect()
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp)
    window.removeEventListener('blur', this.onBlur); document.removeEventListener('visibilitychange', this.onVisibility)
    this.container.removeEventListener('pointermove', this.pointerMove); this.container.removeEventListener('pointerleave', this.pointerLeave)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    this.audio.dispose(); this.clearEffects()
    this.world.dispose()
    this.wingTrails.forEach(trail => trail.dispose())
    this.disposeGroup(this.scene, true)
    this.explosionTexture.dispose(); this.smokeTexture.dispose()
    this.scene.environment?.dispose()
    this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
