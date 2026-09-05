import * as THREE from 'three'

export interface AircraftModel extends THREE.Group {
  userData: { flames: THREE.Mesh[]; glows: THREE.Sprite[] }
}

const materials = {
  body: new THREE.MeshStandardMaterial({ color: '#8c9aa6', metalness: 0.68, roughness: 0.49, flatShading: true }),
  wing: new THREE.MeshStandardMaterial({ color: '#80929f', metalness: 0.62, roughness: 0.52, side: THREE.DoubleSide }),
  panel: new THREE.MeshStandardMaterial({ color: '#667b8a', metalness: 0.56, roughness: 0.55, side: THREE.DoubleSide }),
  light: new THREE.MeshStandardMaterial({ color: '#a4b0b8', metalness: 0.62, roughness: 0.52, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: '#1c2831', metalness: 0.7, roughness: 0.38 }),
  intake: new THREE.MeshStandardMaterial({ color: '#09131c', roughness: 0.87 }),
  canopy: new THREE.MeshStandardMaterial({ color: '#a2874e', metalness: 0.88, roughness: 0.15 }),
  nozzle: new THREE.MeshStandardMaterial({ color: '#3b444b', metalness: 0.91, roughness: 0.37 }),
  su: new THREE.MeshStandardMaterial({ color: '#758994', metalness: 0.5, roughness: 0.6, flatShading: true }),
  suWing: new THREE.MeshStandardMaterial({ color: '#6a8498', metalness: 0.5, roughness: 0.58, side: THREE.DoubleSide }),
}

function plate(vertices: number[][], thickness: number, material: THREE.Material) {
  const points = vertices.map(p => new THREE.Vector3(...p as [number, number, number]))
  const normal = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0])).normalize()
  const positions: number[] = []
  const indices: number[] = []
  for (const sign of [1, -1]) for (const point of points) positions.push(...point.clone().addScaledVector(normal, sign * thickness / 2).toArray())
  const n = points.length
  for (let i = 1; i < n - 1; i++) { indices.push(0, i, i + 1); indices.push(n, n + i + 1, n + i) }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(i, n + i, j, j, n + i, n + j) }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function panelLine(points: number[][], opacity = 0.48) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p as [number, number, number])))
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#273e4d', transparent: true, opacity }))
}

function fuselage(sections: number[][], material: THREE.Material) {
  const vertices: number[] = []
  const indices: number[] = []
  const ring = [[0, 1], [0.7, 0.75], [1, 0.05], [0.75, -0.7], [0, -1], [-0.75, -0.7], [-1, 0.05], [-0.7, 0.75]]
  for (const [z, width, height, offset] of sections) for (const [x, y] of ring) vertices.push(x * width, y * height + offset, z)
  for (let s = 0; s < sections.length - 1; s++) for (let k = 0; k < 8; k++) {
    const a = s * 8 + k, b = s * 8 + (k + 1) % 8, c = (s + 1) * 8 + k, d = (s + 1) * 8 + (k + 1) % 8
    indices.push(a, c, b, b, c, d)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function ellipsoid(radius: number, scale: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 14), material)
  mesh.scale.set(...scale)
  mesh.position.set(...position)
  return mesh
}

function glowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,250,223,1)')
  gradient.addColorStop(0.12, 'rgba(255,206,150,0.85)')
  gradient.addColorStop(0.32, 'rgba(255,140,79,0.32)')
  gradient.addColorStop(1, 'rgba(255,96,45,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function insignia() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(27,46,57,.68)'
  ctx.fillStyle = 'rgba(27,46,57,.68)'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(128, 64, 37, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeRect(58, 52, 38, 24); ctx.strokeRect(160, 52, 38, 24)
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 - Math.PI / 2
    const radius = i % 2 ? 14 : 31
    const x = 128 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
}

export function createAircraft(kind: 'f22' | 'su35' = 'f22'): AircraftModel {
  const group = new THREE.Group() as AircraftModel
  group.userData = { flames: [], glows: [] }
  const isRaptor = kind === 'f22'
  const bodyMat = isRaptor ? materials.body : materials.su
  const wingMat = isRaptor ? materials.wing : materials.suWing
  group.add(fuselage(isRaptor ? [
    [-9.8, 0.035, 0.04, -0.02], [-7.2, 0.53, 0.24, 0.06], [-5, 1.0, 0.43, 0.16],
    [-3.1, 1.36, 0.57, 0.12], [-0.5, 1.7, 0.63, 0.04], [3.7, 1.83, 0.5, -0.01], [7.45, 1.6, 0.33, -0.13],
  ] : [
    [-11, 0.035, 0.03, 0], [-7.7, 0.55, 0.46, 0], [-4.7, 0.9, 0.65, 0.12],
    [-1.8, 1.45, 0.6, 0], [3, 1.65, 0.5, -0.03], [8.8, 1.25, 0.35, 0],
  ], bodyMat))

  // The F-22's diamond wings, clipped stabilizers and outward-canted twin tails.
  for (const side of [-1, 1]) {
    const wing = isRaptor ? [
      [1.15, 0.06, -4.0], [2.0, 0.03, -3.4], [6.8, -0.1, 1.55],
      [6.65, -0.1, 2.65], [3.5, 0.02, 3.8], [1.22, 0.09, 3.0],
    ] : [
      [1.0, 0.02, -3.7], [1.9, 0.01, -2.9], [7.35, -0.12, 2.3],
      [7.0, -0.12, 3.6], [2.2, 0.03, 3.5], [1.3, 0.06, 2],
    ]
    group.add(plate(wing.map(([x, y, z]) => [x * side, y, z]), 0.12, wingMat))
    group.add(plate([
      [side * 1.6, 0.02, 3.65], [side * 2.05, -0.02, 3.8], [side * 4.3, -0.11, 6.25],
      [side * 3.9, -0.11, 7.95], [side * 1.45, -0.02, 7.3],
    ], 0.12, bodyMat))
    group.add(plate([
      [side * 1.4, 0.35, 2.4], [side * (isRaptor ? 2.35 : 1.7), 3.05, 4.45],
      [side * (isRaptor ? 2.56 : 1.76), 2.92, 6.45], [side * 1.72, 0.3, 7.3],
    ], 0.13, wingMat))
    // Faceted leading-edge extensions and tonal access panels.
    group.add(plate([
      [side * 0.62, 0.38, -5.6], [side * 1.22, 0.39, -3.8], [side * 2.0, 0.18, -2.6],
      [side * 1.84, 0.35, 3.5], [side * 1.22, 0.6, 2.6],
    ], 0.04, materials.light))
    group.add(plate([
      [side * 2.3, 0.11, 0.9], [side * 4.15, 0.01, 2.7], [side * 3.55, 0.12, 3.32], [side * 1.9, 0.19, 2.55],
    ], 0.025, materials.panel))
    group.add(panelLine([[side * 1.8, 0.16, -2.9], [side * 5.7, 0.01, 1.56], [side * 5.68, 0.01, 2.8]]))
    group.add(panelLine([[side * 2, 0.14, 1.3], [side * 3.45, 0.14, 2.9], [side * 6.56, -0.01, 2.35]]))
    group.add(panelLine([[side * 2, 0.0, 4.6], [side * 3.58, 0, 6.42], [side * 3.35, 0, 7.54]]))
    group.add(panelLine([[side * 1.56, 0.43, 4.9], [side * 2.3, 2.62, 5.69], [side * 2.47, 2.65, 6.35]]))
    group.add(panelLine([[side * 0.7, 0.69, -1.8], [side * 0.7, 0.62, 2.2], [side * 1.05, 0.49, 3.1]]))

    // Recessed trapezoidal intakes under the shoulder of each wing.
    group.add(plate([
      [side * 0.98, 0.12, -3.9], [side * 1.8, 0.03, -3.2],
      [side * 1.65, -0.7, -2.9], [side * 0.95, -0.61, -3.5],
    ], 0.04, materials.intake))
    const intakeBody = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 4.2), bodyMat)
    intakeBody.position.set(side * 1.14, -0.4, -0.8)
    group.add(intakeBody)

    if (isRaptor) {
      const nozzle = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 1.18), materials.nozzle)
      nozzle.position.set(side * 0.85, -0.12, 7.44)
      group.add(nozzle)
      const opening = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.38), materials.intake)
      opening.position.set(side * 0.85, -0.12, 8.04)
      group.add(opening)
      for (let n = 0; n < 7; n++) {
        group.add(panelLine([[side * 0.85 - 0.6 + n * 0.2, 0.205, 6.95], [side * 0.85 - 0.6 + n * 0.2, 0.205, 8.05]], 0.9))
      }
    } else {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.69, 6.5, 14), materials.nozzle)
      engine.rotation.x = Math.PI / 2
      engine.position.set(side * 1.05, -0.26, 5.05)
      group.add(engine)
    }

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.41, 4.5, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uBoost;
        void main() { float bands=.73+.27*sin(vUv.y*53.-uTime*37.); float fade=pow(1.-vUv.y,1.7);
        vec3 color=mix(vec3(1.,.26,.07),vec3(.54,.64,1.),uBoost*.72);
        color=mix(color,vec3(1.,.91,.77),pow(1.-vUv.y,5.));
        gl_FragColor=vec4(color*1.4, fade*bands*(.35+uBoost*.2)); }`,
    }))
    flame.rotation.x = Math.PI / 2
    flame.position.set(side * 0.85, -0.12, 10.13)
    flame.scale.set(1.16, 1, isRaptor ? 0.6 : 1)
    group.add(flame)
    group.userData.flames.push(flame)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }))
    glow.position.set(side * 0.85, -0.12, 8.05)
    glow.scale.set(2.3, 1.8, 1)
    group.add(glow)
    group.userData.glows.push(glow)

    const navigationLight = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 5), new THREE.MeshBasicMaterial({ color: side === -1 ? '#ff827a' : '#aaf7e8' }))
    navigationLight.position.set(side * 6.64, -0.01, 2.4)
    group.add(navigationLight)
  }

  group.add(ellipsoid(1, [0.62, 0.13, 1.94], [0, 0.65, -3.9], materials.dark))
  group.add(ellipsoid(1, [0.53, 0.52, 1.69], [0, 0.78, -3.9], materials.canopy))
  group.add(panelLine([[0, 0.91, -5.59], [0, 1.27, -4.5], [0, 1.29, -3.6], [0, 0.96, -2.26]], 0.65))
  group.add(plate([[-0.8, 0.52, 0], [0.8, 0.52, 0], [0.64, 0.6, 3.8], [-0.64, 0.6, 3.8]], 0.025, materials.body))
  group.add(panelLine([[-0.55, 0.66, -0.9], [0.55, 0.66, -0.9], [0.55, 0.67, 1.5], [-0.55, 0.67, 1.5], [-0.55, 0.66, -0.9]], 0.6))

  if (isRaptor) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), insignia())
    decal.rotation.x = -Math.PI / 2
    decal.rotation.z = -0.15
    decal.position.set(-3.8, 0.13, 1.4)
    group.add(decal)
    const tailCanvas = document.createElement('canvas')
    tailCanvas.width = 128; tailCanvas.height = 128
    const ctx = tailCanvas.getContext('2d')!
    ctx.fillStyle = '#344854'; ctx.textAlign = 'center'; ctx.font = 'bold 39px sans-serif'
    ctx.fillText('FF', 64, 52); ctx.font = '19px monospace'; ctx.fillText('AF 022', 64, 82)
    const tailMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tailCanvas), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 })
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), tailMaterial)
      decal.rotation.y = side * Math.PI / 2
      decal.rotation.x = -side * 0.3
      decal.position.set(side * 2.1, 1.8, 5.15)
      group.add(decal)
    }
  }
  group.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return group
}

export function updateEngineFlames(model: AircraftModel, time: number, boost: boolean) {
  for (const flame of model.userData.flames) {
    const material = flame.material as THREE.ShaderMaterial
    material.uniforms.uTime.value = time
    material.uniforms.uBoost.value = boost ? 1 : 0
    flame.scale.y = (boost ? 1.8 : 0.85) + Math.sin(time * 38) * 0.06
    flame.position.z = 8.05 + 2.1 * flame.scale.y
  }
  for (const glow of model.userData.glows) {
    glow.material.opacity = boost ? 1 : 0.7
    glow.scale.set(boost ? 3.5 : 2.3, boost ? 2.7 : 1.8, 1)
  }
}
