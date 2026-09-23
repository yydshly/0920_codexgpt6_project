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
const {makeTwoBoneIK}=await import('./two-bone-ik-example.mjs');
const file=process.argv[2]||'../companion-web/dist/assets/avatars/modern.vrm';
const bytes=readFileSync(new URL(file,import.meta.url));
const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
json.materials=(json.materials||[]).map(material=>({name:material.name}));
json.images=[];json.textures=[];
if(json.extensions?.VRM){json.extensions.VRM.meta.texture=-1;delete json.extensions.VRM.materialProperties;}
if(json.extensions?.VRMC_vrm)delete json.extensions.VRMC_vrm.meta.thumbnailImage;
const jsonText=JSON.stringify(json),jsonBuffer=Buffer.from(jsonText+' '.repeat((4-jsonText.length%4)%4));
const dataChunk=bytes.subarray(20+jsonLength);
const result=Buffer.alloc(20+jsonBuffer.length+dataChunk.length);
result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
result.writeUInt32LE(jsonBuffer.length,12);result.writeUInt32LE(0x4e4f534a,16);jsonBuffer.copy(result,20);dataChunk.copy(result,20+jsonBuffer.length);
globalThis.ProgressEvent=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};
const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
const gltf=await loader.parseAsync(result.buffer,'');const vrm=gltf.userData.vrm;
const actor=new THREE.Group();actor.add(vrm.scene);VRMUtils.rotateVRM0(vrm);actor.updateMatrixWorld(true);
const names=['hips','leftUpperLeg','leftLowerLeg','leftFoot','leftToes','rightFoot','rightToes'];
const position=(n)=>n?.getWorldPosition(new THREE.Vector3()).toArray();
function report(phase){actor.updateMatrixWorld(true);console.log(JSON.stringify({phase,bones:names.map(name=>({name,normalized:position(vrm.humanoid.getNormalizedBoneNode(name)),raw:position(vrm.humanoid.getRawBoneNode(name))})),meshBounds:gltf.scene.children.filter(x=>x.isMesh).map(x=>({name:x.name,bounds:new THREE.Box3().setFromObject(x).min.toArray()}))}));}
const box=new THREE.Box3().setFromObject(vrm.scene);console.log(JSON.stringify({file,metaVersion:vrm.meta.metaVersion,boxMin:box.min.toArray(),boxMax:box.max.toArray()}));
report('initial');
const contacts=['left','right'].map(side=>{const upper=vrm.humanoid.getNormalizedBoneNode(side+'UpperLeg'),lower=vrm.humanoid.getNormalizedBoneNode(side+'LowerLeg'),foot=vrm.humanoid.getNormalizedBoneNode(side+'Foot');return{upper,foot,p:foot.getWorldPosition(new THREE.Vector3()),q:foot.getWorldQuaternion(new THREE.Quaternion()),ik:makeTwoBoneIK(THREE,upper,lower,foot)};});
vrm.humanoid.getNormalizedBoneNode('hips').position.y-=.024;
actor.updateMatrixWorld(true);
for(const c of contacts)c.ik.solve(c.p,c.upper.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0,1)),c.q);
vrm.update(0);report('solved');
const v=new THREE.Vector3();const minima=[];
vrm.scene.traverse(node=>{if(node.isSkinnedMesh&&!node.name.startsWith('Hair')){node.skeleton.update();let min=Infinity,indexMin=Infinity;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,v);v.applyMatrix4(node.matrixWorld);min=Math.min(min,v.y);}const index=node.geometry.index;if(index)for(let i=0;i<index.count;i++){node.getVertexPosition(index.getX(i),v);v.applyMatrix4(node.matrixWorld);indexMin=Math.min(indexMin,v.y);}minima.push({name:node.name,material:node.material.name,vertexMin:min,indexMin,boxMin:new THREE.Box3().setFromObject(node).min.y});}});
console.log(JSON.stringify({skinnedMinima:minima}));

if(process.argv.includes('--gait')){
  const {Avatar}=await import('../companion-web/dist/character.js');
  const avatar=Object.create(Avatar.prototype);
  const bones={};for(const name of Object.keys(vrm.humanoid.normalizedHumanBones))bones[name]=vrm.humanoid.getNormalizedBoneNode(name);
  vrm.humanoid.resetNormalizedPose();actor.rotation.y=Math.PI/2;actor.position.set(0,0,0);actor.updateMatrixWorld(true);
  Object.assign(avatar,{actor,vrm,bones,hipPosition:bones.hips.position.clone(),elapsed:0,walkWeight:1,gaitPhase:0,look:{x:0,y:0},gestureStart:0,gestureUntil:0,reduceMotion:false,legacyVRM:vrm.meta.metaVersion==='0',targetEuler:new THREE.Euler(),targetQuaternion:new THREE.Quaternion(),modelHeight:box.max.y-box.min.y});
  avatar.seedFeet();
  const dt=1/60;const gaitSpeed=Number(process.argv.find(x=>x.startsWith('--speed='))?.slice(8)||.47);let maxError=0,maxSupportError=0,steps=0,wasSwing=false,lastSide=null;const out=[];
  for(let i=0;i<600;i++){
    const moving=i<300,velocity=moving?gaitSpeed:0;avatar.elapsed+=dt;actor.position.x+=velocity*dt;if(!moving&&process.argv.includes('--turn-stop'))actor.rotation.y+=THREE.MathUtils.clamp(-.12-actor.rotation.y,-dt*1.7,dt*1.7);
    avatar.gaitPhase+=velocity*dt/(process.argv.includes('--dynamic-drop')?.28:.6)*Math.PI*2;avatar.walkWeight=THREE.MathUtils.damp(avatar.walkWeight,moving?1:0,10,dt);
    avatar.velocity.set(velocity,0,0);avatar.animateBody(dt);bones.hips.position.y-=Number(process.argv.find(x=>x.startsWith('--extra-drop='))?.slice(13)||0);if(process.argv.includes('--dynamic-drop'))bones.hips.position.y=avatar.hipPosition.y-(.026+.018*avatar.walkWeight)+Math.abs(Math.sin(avatar.gaitPhase*2))*.005*avatar.walkWeight;actor.updateMatrixWorld(true);avatar.plantFeet(dt);vrm.update(dt);actor.updateMatrixWorld(true);
    if(avatar.swing&&!wasSwing){steps++;lastSide=avatar.contacts[avatar.swing.index].side;}
    wasSwing=!!avatar.swing;
    for(const [fi,c]of avatar.contacts.entries()){
      const raw=vrm.humanoid.getRawBoneNode(c.side+'Foot').getWorldPosition(new THREE.Vector3());const error=raw.distanceTo(c.position);maxError=Math.max(maxError,error);if(!avatar.swing||avatar.swing.index!==fi)maxSupportError=Math.max(maxSupportError,error);
    }
    if(i%60===0||i===599)out.push({time:avatar.elapsed,rootX:actor.position.x,swing:avatar.swing?.index,steps});
  }
  console.log(JSON.stringify({gait:{maxError,maxSupportError,steps,out}}));
}
