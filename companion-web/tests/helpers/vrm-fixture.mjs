import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

// Parse the actual checked-in skeleton/skin without loading browser textures.
// The JSON material names remain available for the same shoe-floor detection
// used by the visible character. No network or image decoder is needed.
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='three')return{url:new URL('../../dist/vendor/three.core.js',import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith('three/addons/'))return{url:new URL('../../dist/vendor/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
  if(specifier==='@pixiv/three-vrm')return{url:new URL('../../dist/vendor/three-vrm.module.min.js',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}});
export const THREE=await import('../../dist/vendor/three.core.js');
const {GLTFLoader}=await import('../../dist/vendor/loaders/GLTFLoader.js');
const {VRMLoaderPlugin,VRMUtils}=await import('../../dist/vendor/three-vrm.module.min.js');
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};

export async function loadVrmFixture(name='modern'){
  const bytes=readFileSync(new URL(`../../dist/assets/avatars/${name}.vrm`,import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  json.materials=(json.materials||[]).map(material=>({name:material.name}));json.images=[];json.textures=[];
  if(json.extensions?.VRM){json.extensions.VRM.meta.texture=-1;delete json.extensions.VRM.materialProperties;}
  if(json.extensions?.VRMC_vrm)delete json.extensions.VRMC_vrm.meta.thumbnailImage;
  const content=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-content.length%4)%4,32),jsonBuffer=Buffer.concat([content,padding]);
  const dataChunk=bytes.subarray(20+jsonLength),result=Buffer.alloc(20+jsonBuffer.length+dataChunk.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);result.writeUInt32LE(0x4e4f534a,16);jsonBuffer.copy(result,20);dataChunk.copy(result,20+jsonBuffer.length);
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));const gltf=await loader.parseAsync(result.buffer,'');
  const vrm=gltf.userData.vrm,actor=new THREE.Group();actor.add(vrm.scene);VRMUtils.rotateVRM0(vrm);actor.updateMatrixWorld(true);
  const bones={};for(const name of Object.keys(vrm.humanoid.normalizedHumanBones))bones[name]=vrm.humanoid.getNormalizedBoneNode(name);
  const box=new THREE.Box3().setFromObject(vrm.scene),vertex=new THREE.Vector3();let shoeFloor=Infinity;
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!materials.some(material=>/Shoes|Boot|Footwear/i.test(material?.name||'')))return;
    mesh.skeleton?.update();const position=mesh.geometry.attributes.position,indices=mesh.geometry.index;
    const used=indices?new Set(indices.array):Array.from({length:position.count},(_,i)=>i);
    for(const index of used){mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);shoeFloor=Math.min(shoeFloor,vertex.y);}
  });
  const modelFloor=Number.isFinite(shoeFloor)?shoeFloor:box.min.y;
  return{THREE,gltf,vrm,actor,bones,hipPosition:bones.hips.position.clone(),modelFloor,modelHeight:box.max.y-modelFloor};
}
