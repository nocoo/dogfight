import * as THREE from 'three'

export function createVolumetricClouds() {
  const size = 64
  const data = new Uint8Array(size ** 3)
  let seed = 19123
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    data[i] = (seed >>> 24) & 255
  }
  const noise = new THREE.Data3DTexture(data, size, size, size)
  noise.format = THREE.RedFormat
  noise.type = THREE.UnsignedByteType
  noise.minFilter = noise.magFilter = THREE.LinearFilter
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping
  noise.unpackAlignment = 1
  noise.needsUpdate = true

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uNoise: { value: noise },
      uTime: { value: 0 },
      uSteps: { value: 56 },
      uLight: { value: new THREE.Color('#d0cee5') },
      uShadow: { value: new THREE.Color('#4f648c') },
      uHaze: { value: new THREE.Color('#a0a6c0') },
    },
    vertexShader: `out vec3 vWorld; void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `
      precision highp float;
      precision highp sampler3D;
      uniform sampler3D uNoise;
      uniform float uTime;
      uniform int uSteps;
      uniform vec3 uLight, uShadow, uHaze;
      in vec3 vWorld;
      out vec4 outColor;
      float density(vec3 world){
        float h=(world.y-550.)/1550.;
        if(h<0. || h>1.) return 0.;
        vec3 p=world*.000028+vec3(uTime*.00009,0.,0.);
        float base=texture(uNoise,p*.23+vec3(.11,.3,.27)).r;
        float n=texture(uNoise,p).r*.57;
        n+=texture(uNoise,p*2.03+vec3(.1,.4,.3)).r*.28;
        n+=texture(uNoise,p*4.07).r*.15;
        float body=base*.37+n*.63;
        float shape=smoothstep(.0,.18,h)*(1.-smoothstep(.42,1.,h));
        float d=max(0.,body-.44-(1.-shape)*.24)*4.;
        // Leave a winding opening over the fjord; banks roll in at its edges.
        float channel=smoothstep(800.,4000.,abs(world.x+sin(world.z*.00017)*1500.));
        return d*mix(.19,1.,channel);
      }
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        bool inside=cameraPosition.y>550.&&cameraPosition.y<2100.;
        if((inside&&gl_FrontFacing)||(!inside&&!gl_FrontFacing)) discard;
        vec3 ray=normalize(vWorld-cameraPosition);
        float tA=(550.-cameraPosition.y)/ray.y;
        float tB=(2100.-cameraPosition.y)/ray.y;
        float start=max(0.,min(tA,tB));
        float end=min(55000.,max(tA,tB));
        if(end<=start || abs(ray.y)<.00001) discard;
        float stepSize=clamp((end-start)/float(uSteps),45.,580.);
        float t=start+(.41+hash(gl_FragCoord.xy)*.18)*stepSize;
        vec3 lightDir=normalize(vec3(.5,.7,-.6));
        vec4 accum=vec4(0.);
        for(int i=0;i<64;i++){
          if(i>=uSteps || t>end || accum.a>.985) break;
          vec3 pos=cameraPosition+ray*t;
          float d=density(pos);
          if(d>.008){
            float h=clamp((pos.y-550.)/1550.,0.,1.);
            float shade=density(pos+lightDir*230.);
            float light=clamp(.64-shade*.95-d*.38+h*.32,.15,1.);
            vec3 color=mix(uShadow,uLight,light);
            float edge=pow(max(0.,dot(ray,lightDir)),6.)*(1.-d)*.13;
            color+=vec3(.33,.18,.14)*edge;
            color=mix(color,uHaze,smoothstep(8000.,50000.,t)*.68);
            float alpha=1.-exp(-d*stepSize*.0034);
            accum.rgb+=(1.-accum.a)*color*alpha;
            accum.a+=(1.-accum.a)*alpha;
          }
          t+=stepSize;
        }
        if(accum.a<.015) discard;
        vec3 color=accum.rgb/max(accum.a,.001);
        color=mix(color*12.92,1.055*pow(color,vec3(1./2.4))-.055,step(vec3(.0031308),color));
        outColor=vec4(color,accum.a);
      }
    `,
  })
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(145000, 1550, 145000), material)
  cloud.position.y = 1325
  cloud.renderOrder = 1
  cloud.frustumCulled = false
  return {
    mesh: cloud,
    update(time: number, cameraPosition: THREE.Vector3) {
      material.uniforms.uTime.value = time
      cloud.position.x = cameraPosition.x
      cloud.position.z = cameraPosition.z
    },
    setQuality(high: boolean) { material.uniforms.uSteps.value = high ? 56 : 32 },
    dispose() { noise.dispose() },
  }
}
