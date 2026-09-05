import * as THREE from 'three'
import { terrainHeight } from './simulation'
import { createVolumetricClouds } from './clouds'

export function seededRandom(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function makeCloudTexture(seed = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const random = seededRandom(seed)
  const puffs = Array.from({ length: 65 }, () => ({
    x: 160 + random() * 700,
    y: 180 + random() * 140,
    radius: 45 + random() * 100,
  })).sort((a, b) => b.y - a.y)
  for (const puff of puffs) {
    const distance = Math.abs(puff.x - 512) / 512
    const r = puff.radius * (1 - distance * 0.3)
    const grad = ctx.createRadialGradient(puff.x - r * 0.18, puff.y - r * 0.3, r * 0.1, puff.x, puff.y, r)
    const shade = Math.round(232 + random() * 17)
    grad.addColorStop(0, `rgba(${shade},${shade},${Math.min(255, shade + 8)},.85)`)
    grad.addColorStop(0.45, 'rgba(224,225,238,.6)')
    grad.addColorStop(0.75, 'rgba(195,202,222,.26)')
    grad.addColorStop(1, 'rgba(177,190,218,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(puff.x, puff.y, r, 0, Math.PI * 2); ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createWorld(scene: THREE.Scene) {
  const group = new THREE.Group()
  scene.add(group)
  scene.fog = new THREE.FogExp2('#8c9ab5', 0.000026)
  scene.add(new THREE.HemisphereLight('#c5d8ff', '#637ba1', 1.5))
  const sunlight = new THREE.DirectionalLight('#ffceb4', 2.65)
  sunlight.position.set(4000, 6500, -7000)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.camera.left = -21
  sunlight.shadow.camera.right = 21
  sunlight.shadow.camera.top = 23
  sunlight.shadow.camera.bottom = -23
  sunlight.shadow.camera.near = 1
  sunlight.shadow.camera.far = 150
  sunlight.shadow.bias = -0.00015
  sunlight.shadow.normalBias = 0.035
  sunlight.shadow.radius = 2
  scene.add(sunlight, sunlight.target)

  const sky = new THREE.Mesh(new THREE.SphereGeometry(115000, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    toneMapped: false,
    uniforms: { uTime: { value: 0 }, uTop: { value: new THREE.Color('#3c628b') }, uHorizon: { value: new THREE.Color('#aba5c2') }, uDusk: { value: new THREE.Color('#f2b5aa') } },
    vertexShader: `varying vec3 vWorld; void main() { vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `varying vec3 vWorld; uniform float uTime; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uDusk;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){float f=0.; f+=.5*noise(p);p=p*2.03+15.;f+=.25*noise(p);p=p*2.01+5.;f+=.125*noise(p);p=p*2.03;f+=.0625*noise(p);return f;}
      void main(){
        vec3 dir=normalize(vWorld-cameraPosition); float h=dir.y;
        vec3 color=mix(uHorizon,uTop,smoothstep(-.09,.43,h));
        vec3 sunDir=normalize(vec3(.27,.035,-1.)); float sun=dot(dir,sunDir);
        color=mix(color,uDusk,pow(max(0.,sun),10.)*.83*(1.-smoothstep(.12,.43,h)));
        color+=vec3(.15,.075,.04)*pow(max(0.,sun),130.);
        color+=vec3(1.,.78,.5)*smoothstep(.99972,.9999,sun)*.8;
        vec2 uv=dir.xz/(max(.05,dir.y+.18))*1.5; uv.x+=uTime*.0006;
        float cloud=fbm(uv*2.6+vec2(fbm(uv*1.8),0.));
        float cirrus=smoothstep(.49,.75,cloud)*smoothstep(.02,.3,h)*(1.-smoothstep(.4,.95,h));
        color=mix(color,vec3(.62,.64,.79),cirrus*.32);
        // A pale crescent hangs over the combat zone.
        vec3 moonDir=normalize(vec3(-.05,.29,-1.));
        float moon=length(dir-moonDir); float disc=1.-smoothstep(.035,.036,moon);
        float shadow=1.-smoothstep(.034,.036,length(dir-normalize(moonDir+vec3(.014,.004,0.))));
        float craters=.86+.14*noise(dir.xy*450.);
        color=mix(color,vec3(.95,.93,.96)*craters,disc*(1.-shadow*.8)*.72);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  }))
  sky.renderOrder = -10
  sky.frustumCulled = false
  scene.add(sky)

  const water = new THREE.Mesh(new THREE.PlaneGeometry(250000, 250000), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogColor: { value: new THREE.Color('#8c9ab5') } },
    vertexShader: `varying vec3 vWorld; varying float vDepth; void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 mv=viewMatrix*world;vDepth=-mv.z;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uTime; uniform vec3 uFogColor; varying vec3 vWorld; varying float vDepth;
      void main(){
        vec3 eye=normalize(cameraPosition-vWorld); float fresnel=pow(1.-max(eye.y,0.),3.);
        vec3 color=mix(vec3(.038,.12,.18),vec3(.23,.34,.49),fresnel*.7);
        float wave=sin(vWorld.x*.005+sin(vWorld.z*.0007+uTime*.1)*2.1)*.5+sin(vWorld.z*.011+vWorld.x*.002-uTime*.3)*.25;
        float fine=sin(vWorld.x*.087+vWorld.z*.097+uTime*.4);
        color+=vec3(.012,.02,.024)*(wave*.6+fine*.04);
        vec3 reflected=reflect(-eye,normalize(vec3(wave*.021,1.,fine*.017)));
        float glint=pow(max(0.,dot(reflected,normalize(vec3(.27,.035,-1.)))),95.);
        color+=vec3(.73,.47,.32)*glint*.9;
        float fog=1.-exp(-.000026*.000026*vDepth*vDepth);color=mix(color,uFogColor,fog);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }))
  water.rotation.x = -Math.PI / 2
  water.position.y = -8
  group.add(water)

  const terrain = new THREE.PlaneGeometry(64000, 85000, 260, 300)
  terrain.rotateX(-Math.PI / 2)
  const positions = terrain.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const stone = new THREE.Color('#4d6c86'), snow = new THREE.Color('#c0cddd'), coast = new THREE.Color('#2d5667')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) - 14000
    const height = terrainHeight(x, z)
    positions.setXYZ(i, x, height, z)
    const localColor = coast.clone().lerp(stone, Math.min(1, height / 550))
    if (height > 1350) localColor.lerp(snow, Math.min(0.9, (height - 1350) / 1200))
    localColor.multiplyScalar(0.93 + Math.sin(x * 0.0037 + z * 0.0031) * 0.065)
    colors.set(localColor.toArray(), i * 3)
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  terrain.computeVertexNormals()
  group.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.07 })))

  const random = seededRandom(48)
  const cloudTextures = [makeCloudTexture(3), makeCloudTexture(19), makeCloudTexture(72), makeCloudTexture(101)]
  const clouds: THREE.Sprite[] = []
  for (let i = 0; i < 46; i++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTextures[i % 4], transparent: true, depthWrite: false,
      opacity: 0.3 + random() * 0.2, color: i % 4 === 0 ? '#adb5d2' : '#c0cadd', fog: true,
    }))
    let x = (random() - 0.5) * 68000
    let z = (random() - 0.68) * 76000
    if (Math.abs(x) < 2300 && z > -5000 && z < 5000) x += x < 0 ? -3400 : 3400
    cloud.position.set(x, 550 + random() * 550, z)
    cloud.userData.initialX = x
    const width = 3500 + random() * 6500
    cloud.scale.set(width, width * (0.25 + random() * 0.09), 1)
    cloud.rotation.z = (random() - 0.5) * 0.1
    clouds.push(cloud); group.add(cloud)
  }
  // Closer, translucent banks frame the fighter without obscuring the aim point.
  const foregroundClouds = [[-7200, 780, -4000, 3800], [7000, 600, -6000, 4400]]
  for (const [x, y, z, width] of foregroundClouds) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTextures[1], transparent: true, depthWrite: false, opacity: 0.35, color: '#b3c3dc', fog: true }))
    cloud.position.set(x, y, z); cloud.scale.set(width, width * 0.39, 1)
    cloud.userData.initialX = x
    clouds.push(cloud); group.add(cloud)
  }

  const volume = createVolumetricClouds()
  group.add(volume.mesh)

  return {
    update(time: number, cameraPosition: THREE.Vector3, playerPosition: THREE.Vector3) {
      sky.position.copy(cameraPosition)
      ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = time
      ;(water.material as THREE.ShaderMaterial).uniforms.uTime.value = time
      clouds.forEach((cloud, i) => { cloud.position.x = cloud.userData.initialX + time * (0.6 + (i % 3) * 0.25) })
      volume.update(time, cameraPosition)
      sunlight.position.copy(playerPosition).add(new THREE.Vector3(34, 50, -35))
      sunlight.target.position.copy(playerPosition)
    },
    setQuality(high: boolean) { volume.setQuality(high) },
    dispose() { volume.dispose() },
  }
}
