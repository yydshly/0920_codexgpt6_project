import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='three')return {url:new URL('../companion-web/dist/vendor/three.core.js',import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith('three/addons/'))return {url:new URL('../companion-web/dist/vendor/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
  if(specifier==='@pixiv/three-vrm')return {url:new URL('../companion-web/dist/vendor/three-vrm.module.min.js',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}});
const THREE=await import('../companion-web/dist/vendor/three.core.js');
const {GLTFLoader}=await import('../companion-web/dist/vendor/loaders/GLTFLoader.js');
const {VRMLoaderPlugin,VRMUtils}=await import('../companion-web/dist/vendor/three-vrm.module.min.js');
const model=process.argv.find(a=>a.startsWith('--model='))?.slice(8)||'modern';
const bytes=readFileSync(new URL('../companion-web/dist/assets/avatars/'+model+'.vrm',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
json.materials=(json.materials||[]).map(material=>({name:material.name}));json.images=[];json.textures=[];
if(json.extensions?.VRM){json.extensions.VRM.meta.texture=-1;delete json.extensions.VRM.materialProperties;}
if(json.extensions?.VRMC_vrm)delete json.extensions.VRMC_vrm.meta.thumbnailImage;
const jsonText=JSON.stringify(json),jsonBuffer=Buffer.from(jsonText+' '.repeat((4-jsonText.length%4)%4)),dataChunk=bytes.subarray(20+jsonLength);
const result=Buffer.alloc(20+jsonBuffer.length+dataChunk.length);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);result.writeUInt32LE(0x4e4f534a,16);jsonBuffer.copy(result,20);dataChunk.copy(result,20+jsonBuffer.length);
globalThis.ProgressEvent=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};
const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
const vrm=(await loader.parseAsync(result.buffer,'')).userData.vrm;
const actor=new THREE.Group();actor.add(vrm.scene);VRMUtils.rotateVRM0(vrm);actor.updateMatrixWorld(true);
const pos=name=>vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3());
const set=(name,angles)=>{const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles));if(vrm.meta.metaVersion==='0'){q.x*=-1;q.z*=-1;}vrm.humanoid.getNormalizedBoneNode(name).quaternion.copy(q);};
const update=()=>{actor.updateMatrixWorld(true);vrm.humanoid.update();actor.updateMatrixWorld(true);};
const report=title=>{update();if(!process.argv.includes('--gesture-validation'))console.log(JSON.stringify({title,pose:['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand'].map(name=>({name,p:pos(name).toArray()}))}));};
report('t-pose');
set('leftUpperArm',[-.52,0,-1.12]);set('rightUpperArm',[-.52,0,1.12]);set('leftLowerArm',[-1.18,0,0]);set('rightLowerArm',[-1.18,0,0]);report('current-carry');
// Coordinate descent on three shoulder axes and one elbow bending axis.
if(!process.argv.includes('--quick'))for(const side of process.argv.includes('--wave')||process.argv.includes('--think')?['right']:['left','right']){
  const sign=side==='left'?1:-1;
  const target=process.argv.includes('--wave')?new THREE.Vector3(-.3,1.50,.12):process.argv.includes('--think')?new THREE.Vector3(-.055,1.37,.16):process.argv.includes('--place')?new THREE.Vector3(sign*.135,.99,.34):new THREE.Vector3(sign*.135,1.02,.24),elbowTarget=process.argv.includes('--wave')?new THREE.Vector3(-.29,1.2,.02):process.argv.includes('--think')?new THREE.Vector3(-.2,1.06,.07):process.argv.includes('--place')?new THREE.Vector3(sign*.2,1.07,.09):new THREE.Vector3(sign*.245,.96,.03);
  const score=a=>{set(side+'UpperArm',a.slice(0,3));set(side+'LowerArm',[0,a[3],a[4]]);update();return pos(side+'Hand').distanceToSquared(target)*10+pos(side+'LowerArm').distanceToSquared(elbowTarget)+.0002*a.reduce((n,x)=>n+x*x,0);};
  let best={v:Infinity};
  for(let seed=0;seed<20;seed++){
    let a=seed?Array.from({length:5},()=>Math.random()*3-1.5):[0,0,-sign*1.2,-sign*1.2,0],v=score(a);
    for(let step=.4;step>.001;step*=.65)for(let rounds=0;rounds<20;rounds++){
      let changed=false;
      for(let i=0;i<a.length;i++)for(const s of [-1,1]){const b=[...a];b[i]+=step*s;const bv=score(b);if(bv<v){a=b;v=bv;changed=true;}}
      if(!changed)break;
    }
    if(v<best.v)best={a,v};
  }
  score(best.a);console.log(JSON.stringify({side,optimized:best,target:target.toArray(),elbowTarget:elbowTarget.toArray(),hand:pos(side+'Hand').toArray(),elbow:pos(side+'LowerArm').toArray()}));
}
report('optimized-carry');
set('leftUpperArm',[.16,-.41,-.95]);set('rightUpperArm',[.16,.41,.95]);set('leftLowerArm',[0,-1.47,.13]);set('rightLowerArm',[0,1.47,-.13]);report('rounded-carry');
for(const angles of [[-.2,.6,.8],[0,.5,.8],[-.25,.7,.9]]){
  actor.rotation.y=-.9;set('rightUpperArm',angles);set('rightLowerArm',[0,.55,0]);report('reach-heading-minus-.9 upper '+angles);
}
for(const angles of [[-.1,-.15,-.12],[0,-.2,-.05],[.1,-.25,.05]]){
  actor.rotation.y=.2;set('leftUpperArm',angles);set('leftLowerArm',[0,-.3,0]);report('board-heading-.2 upper '+angles);
}
if(process.argv.includes('--gesture-validation')){
  const {sampleGesture,sampleCarry,gestureNames}=await import('../companion-web/dist/gesture-poses.js');
  for(const [name,t,yaw] of [['wave',.32,0],['think',.41,0],['stretch',.43,0],['take',.43,-.9],['point',.43,.2],['read',.38,0],['receive',.63,0],['carry',0,0],['place',.43,0]]){
    vrm.humanoid.resetNormalizedPose();actor.rotation.y=yaw;
    set('leftUpperArm',[-.1,.07,-1.34]);set('rightUpperArm',[-.08,-.04,1.3]);
    for(const [bone,angles]of Object.entries(name==='carry'?sampleCarry():sampleGesture(name,t)))if(vrm.humanoid.getNormalizedBoneNode(bone))set(bone,angles);
    update();
    console.log(JSON.stringify({model,name,leftHand:pos('leftHand').toArray(),rightHand:pos('rightHand').toArray(),rightElbow:pos('rightLowerArm').toArray(),head:pos('head').toArray()}));
  }
  let worstStep=0;
  for(const name of gestureNames){
    const first=sampleGesture(name,0),last=sampleGesture(name,1),recovery=name==='place'?sampleGesture('read',1):first;
    for(const bone of Object.keys(first))for(let i=0;i<3;i++)if(Math.abs(recovery[bone][i]-last[bone][i])>1e-9)throw Error(name+' does not recover');
    let prev=first;
    for(let i=1;i<=1000;i++){
      const next=sampleGesture(name,i/1000);
      for(const bone of Object.keys(next))for(let j=0;j<3;j++){
        if(!Number.isFinite(next[bone][j]))throw Error('nonfinite pose');
        worstStep=Math.max(worstStep,Math.abs(next[bone][j]-prev[bone][j]));
      }
      prev=next;
    }
  }
  if(worstStep>.03)throw Error('gesture discontinuity '+worstStep);
  let minFront=Infinity,minSeparation=Infinity,maxForward=0;
  for(let i=0;i<=100;i++){
    vrm.humanoid.resetNormalizedPose();actor.rotation.y=0;
    for(const[bone,angles]of Object.entries(sampleGesture('place',i/100)))if(vrm.humanoid.getNormalizedBoneNode(bone))set(bone,angles);
    update();const left=pos('leftHand'),right=pos('rightHand');
    minFront=Math.min(minFront,left.z,right.z);minSeparation=Math.min(minSeparation,left.x-right.x);maxForward=Math.max(maxForward,left.z,right.z);
  }
  if(minFront<0||minSeparation<.2)throw Error('placement hands enter torso or cross');
  console.log(JSON.stringify({placementPath:'passed',model,minFront,minSeparation,maxForward}));
  console.log(JSON.stringify({curveCheck:'passed',gestures:gestureNames.length,samples:1000,worstStep}));
}
