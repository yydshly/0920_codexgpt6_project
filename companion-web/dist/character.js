import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {Footwork} from './locomotion.js';
import {animateBody as updateBody} from './avatar-body.js';
import {Footwork as FootworkV1} from './locomotion-v1.js';
import {animateBody as updateBodyV1} from './avatar-body-v1.js';
import {Footwork as FootworkV3} from './locomotion-v3.js';
import {animateBody as updateBodyV3} from './avatar-body-v3.js';
import {WALK_STYLES,DEFAULT_WALK_STYLE,validWalkStyle} from './walk-styles.js';
import {loadAuthoredMotion} from './authored-motion.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const TAU=Math.PI*2;

export class Avatar {
  constructor(workspace,onUpdate){
    this.workspace=workspace;this.onUpdate=onUpdate;
    this.x=0;this.y=0;this.height=430;this.walk=null;this.manual=0;
    this.elapsed=0;this.gaitPhase=0;this.walkWeight=0;this.direction=1;
    this.walkStyle=DEFAULT_WALK_STYLE;
    this.movementSpeed=0;this.angularSpeed=0;this.motionState='idle';this.gestureMix=0;this.carryWeight=0;
    this.gesture='idle';this.gestureStart=0;this.gestureUntil=0;
    this.yaw=-.12;this.speaking=false;this.closeup=false;this.turnOffset=0;
    this.pointer={x:.5,y:.35,active:false};this.look={x:0,y:0};
    this.nextBlink=2.8;this.blinkStart=-10;this.expression={happy:0,relaxed:0,aa:0,ih:0,oh:0};
    this.targetEuler=new THREE.Euler();this.targetQuaternion=new THREE.Quaternion();this.worldPoint=new THREE.Vector3();
    this.renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#avatar-canvas'),alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));
    this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(0,1,1,0,.01,30);
    this.camera.position.set(0,0,12);this.camera.lookAt(0,0,0);
    this.scene.add(new THREE.AmbientLight(0xf7eeff,.48));
    this.key=new THREE.DirectionalLight(0xfff4ea,1.12);this.key.position.set(-2,4,5);this.scene.add(this.key);
    this.fill=new THREE.DirectionalLight(0xc6e2ff,.34);this.fill.position.set(3,2,4);this.scene.add(this.fill);
    this.rim=new THREE.DirectionalLight(0xb1efdf,.55);this.rim.position.set(1,3,-4);this.scene.add(this.rim);
    this.actor=new THREE.Group();this.scene.add(this.actor);
    this.carrying=false;this.faceHeading=null;
    this.folder=new THREE.Mesh(new THREE.PlaneGeometry(.38,.38),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));this.folder.visible=false;this.scene.add(this.folder);
    loadAuthoredMotion().then(library=>{this.authoredMotion=library;}).catch(error=>console.warn('Authored motion fallback',error));
    new THREE.TextureLoader().load('./assets/studio-folder.png',texture=>{texture.colorSpace=THREE.SRGBColorSpace;this.folder.material.map=texture;this.folder.material.needsUpdate=true;});
    this.eyeTarget=new THREE.Object3D();this.scene.add(this.eyeTarget);
    const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv;void main(){float d=length(vUv-0.5)*2.;float a=pow(1.-smoothstep(0.,1.,d),1.6)*.34;gl_FragColor=vec4(.02,.035,.06,a);}'});
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),shadowMaterial);this.shadow.position.z=-1;this.scene.add(this.shadow);
    this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock=new THREE.Clock();this.resize();this.home();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(workspace);
    this.tick=this.tick.bind(this);this.frame=requestAnimationFrame(this.tick);
  }

  async load(url='./assets/avatars/modern.vrm'){
    const request=this.loadRequest=(this.loadRequest||0)+1;
    const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
    const gltf=await loader.loadAsync(url,event=>{if(request===this.loadRequest&&event.total)document.querySelector('#loading-text').textContent=`准备人物 · ${Math.round(event.loaded/event.total*100)}%`;});
    const next=gltf.userData.vrm;if(!next){VRMUtils.deepDispose(gltf.scene);throw new Error('模型不包含 VRM 数据');}
    if(request!==this.loadRequest){VRMUtils.deepDispose(next.scene);return false;}
    for(const name of ['hips','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'])if(!next.humanoid.getNormalizedBoneNode(name)){VRMUtils.deepDispose(next.scene);throw new Error('模型缺少完整的人形骨骼');}
    this.cancel();this.contacts=null;this.footwork=null;this.swing=null;
    if(this.vrm){this.actor.remove(this.vrm.scene);VRMUtils.deepDispose(this.vrm.scene);}
    this.vrm=next;
    this.legacyVRM=this.vrm.meta.metaVersion==='0';
    VRMUtils.rotateVRM0(this.vrm);
    const anisotropy=Math.min(this.renderer.capabilities.getMaxAnisotropy(),8);
    this.vrm.scene.traverse(object=>{object.frustumCulled=false;if(!object.material)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){
      for(const key of ['map','normalMap','emissiveMap','shadeMultiplyTexture'])if(material[key])material[key].anisotropy=anisotropy;
      if(material.isMToonMaterial){
        // Preserve the model's illustrated textures and outline colors.
        material.giEqualizationFactor=.85;
        material.shadingToonyFactor=Math.min(material.shadingToonyFactor,.82);
        material.outlineWidthFactor=Math.min(material.outlineWidthFactor,.003);
        material.parametricRimColorFactor?.setRGB(.08,.115,.14);
        material.parametricRimFresnelPowerFactor=4;
        material.parametricRimLiftFactor=0;
        material.needsUpdate=true;
      }
    }});
    this.actor.add(this.vrm.scene);
    this.bones={};
    const names=['hips','spine','chest','upperChest','neck','head','leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'];
    for(const side of ['left','right'])for(const finger of ['Index','Middle','Ring','Little'])for(const joint of ['Proximal','Intermediate','Distal'])names.push(`${side}${finger}${joint}`);
    for(const name of names){const bone=this.vrm.humanoid.getNormalizedBoneNode(name);if(bone)this.bones[name]=bone;}
    this.hipPosition=this.bones.hips?.position.clone()||new THREE.Vector3();
    this.actor.position.set(0,0,0);this.actor.rotation.set(0,0,0);this.actor.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(this.vrm.scene);
    // Some VRoid clothing has invisible vertices below the shoes. Derive the
    // floor from rendered footwear vertices, not the bounds of every garment.
    let shoeFloor=Infinity;const vertex=new THREE.Vector3();
    this.vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!materials.some(m=>/Shoes|Boot|Footwear/i.test(m?.name||'')))return;
      mesh.skeleton?.update();const indices=mesh.geometry.index,position=mesh.geometry.attributes.position;
      const used=indices?new Set(indices.array):Array.from({length:position.count},(_,i)=>i);
      for(const index of used){mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);shoeFloor=Math.min(shoeFloor,vertex.y);}
    });
    this.modelFloor=Number.isFinite(shoeFloor)?shoeFloor:box.min.y;this.modelHeight=box.max.y-this.modelFloor;
    this.footSoles=['leftFoot','rightFoot'].map(name=>{const node=this.vrm.humanoid.getRawBoneNode(name);return node?{node,offset:node.getWorldPosition(new THREE.Vector3()).y-this.modelFloor}:null;}).filter(Boolean);
    if(this.vrm.lookAt)this.vrm.lookAt.target=this.eyeTarget;
    this.resize();this.home();this.updatePosition();this.actor.updateMatrixWorld(true);this.vrm.springBoneManager?.reset();
    this.animateBody(1);this.vrm.update(0);this.vrm.springBoneManager?.reset();
    this.seedFeet();this.loaded=true;this.play('wave',2.8);return this;
  }

  resize(){
    const oldW=this.width,oldH=this.areaHeight;
    this.width=this.workspace.clientWidth;this.areaHeight=this.workspace.clientHeight;
    const cap=this.width<450?390:510;
    this.height=Math.min(cap*(this.size||1),Math.max(230,this.areaHeight-110));
    if(this.closeup)this.height=Math.min(980,Math.max(this.areaHeight*1.32,this.height*1.65));
    if(this.studio&&this.roomFrame){this.height=this.roomFrame.height*.635*(this.size||1);if(this.closeup)this.height=Math.min(this.areaHeight*.76,this.height*1.35);}
    // Vary camera framing, not model scale: VRM hair physics remains in meters.
    this.unit=(this.modelHeight||1.65)/this.height;
    this.camera.right=this.width*this.unit;this.camera.top=this.areaHeight*this.unit;this.camera.updateProjectionMatrix();this.renderer.setSize(this.width,this.areaHeight,false);
    if(oldW){this.x=this.x/oldW*this.width;this.y=this.y/oldH*this.areaHeight;}
    this.shadow.scale.set(this.height*.34*this.unit,24*this.unit,1);
    const point=this.clampPoint(this.x,this.y);this.x=point.x;this.y=this.closeup&&!this.studio?this.height+26:point.y;
    this.updatePosition();this.actor.updateMatrixWorld(true);this.vrm?.springBoneManager?.reset();
    if(this.contacts)this.seedFeet();
  }
  home(){if(this.studio&&this.roomFrame){this.x=this.roomFrame.x+this.roomFrame.width*.245;this.y=this.roomFrame.y+this.roomFrame.height*.765;}else{this.x=this.width*(this.width<700?.68:.7);this.y=this.closeup?this.height+26:this.areaHeight-80;}if(this.contacts){this.updatePosition();this.seedFeet();}}
  clampPoint(x,y){if(this.studio&&this.roomFrame){const f=this.roomFrame;return{x:clamp(x,f.x+f.width*.22,f.x+f.width*.83),y:f.y+f.height*.765};}const edge=Math.max(62,this.height*.17);return{x:clamp(x,edge,Math.max(edge,this.width-edge)),y:this.closeup?this.height+26:clamp(y,Math.min(this.height+12,this.areaHeight-80),this.areaHeight-80)};}
  updatePosition(){
    this.actor.position.set(this.x*this.unit,(this.areaHeight-this.y)*this.unit-(this.modelFloor||0),0);
    this.shadow.position.set(this.x*this.unit,(this.areaHeight-this.y-2)*this.unit,-1);this.shadow.visible=!this.closeup;
    this.key.position.set(this.actor.position.x-2,4,5);this.fill.position.set(this.actor.position.x+3,2,4);this.rim.position.set(this.actor.position.x+1,3,-4);
    this.key.target.position.copy(this.actor.position);this.key.target.updateMatrixWorld();this.fill.target.position.copy(this.actor.position);this.fill.target.updateMatrixWorld();this.rim.target.position.copy(this.actor.position);this.rim.target.updateMatrixWorld();
    this.onUpdate?.(this);
  }
  setPointer(x,y){this.pointer={x,y,active:true};}
  setStudio(value){this.cancel();this.studio=value;this.closeup=false;this.faceHeading=null;this.setCarrying(false);this.carryWeight=0;this.folder.material.opacity=0;this.folder.visible=false;this.resize();}
  setRoomFrame(frame){this.roomFrame=frame;this.resize();}
  setCarrying(value){this.carrying=Boolean(value);}
  setWalkStyle(value){
    this.cancel();this.walkStyle=validWalkStyle(value);this.motionCycle=0;this.gaitPhase=0;this.v3BodyCycle=undefined;
    if(this.bones){this.updatePosition();this.seedFeet();}
    return this.walkStyle;
  }
  setSize(value){this.size=clamp(value,.75,1.15);this.resize();}
  setCloseup(value){this.closeup=value;this.resize();return this.closeup;}
  turn(){this.spin={start:this.elapsed,from:this.turnOffset,duration:5.2};}
  moveTo(x,y,{heading=this.faceHeading??-.12}={}){
    if(this.closeup)this.setCloseup(false);
    this.cancel();const point=this.clampPoint(x,y);
    return new Promise(resolve=>{this.walk={x:point.x,y:point.y,heading,arrived:false,stable:0,resolve};});
  }
  faceTo(heading){return this.moveTo(this.x,this.y,{heading});}
  cancel(){
    if(this.walk){this.walk.resolve(false);this.walk=null;}
    this.manual=0;this.movementSpeed=0;this.gestureUntil=this.elapsed;this.pendingGesture=null;
    this.spin=null;this.yaw+=this.turnOffset;this.yaw=Math.atan2(Math.sin(this.yaw),Math.cos(this.yaw));this.turnOffset=0;
  }
  play(name,duration=2.4){
    if(this.walk||this.footwork&&!this.footwork.state.settled){this.pendingGesture={name,duration};return;}
    this.pendingGesture=null;this.gesture=name;this.gestureStart=this.elapsed;this.gestureUntil=this.elapsed+duration;
  }
  poseBone(name,x=0,y=0,z=0){this.pose[name]=[x,y,z];}
  blendBone(name,angles,weight){const base=this.pose[name]||[0,0,0];this.pose[name]=base.map((v,i)=>v+(angles[i]-v)*weight);}
  animateBody(delta){return(this.walkStyle==='v1'?updateBodyV1:this.walkStyle==='v3'?updateBodyV3:updateBody)(this,delta);}

  seedFeet(){
    if(!this.bones)return;
    this.actor.rotation.y=this.yaw+this.turnOffset;
    const Gait=this.walkStyle==='v1'?FootworkV1:this.walkStyle==='v3'?FootworkV3:Footwork;
    this.footwork=new Gait(THREE,this.actor,this.bones,this.hipPosition,this.modelHeight);
    this.contacts=this.footwork.contacts;this.gait=this.footwork.state;
    this.velocity=new THREE.Vector3();this.reachError=0;this.movementSpeed=0;this.angularSpeed=0;
  }
  plantFeet(delta){
    if(!this.footwork)this.seedFeet();
    this.gait=this.footwork.advance(delta,{velocity:this.velocity,turnRate:this.turnRate||0,moving:Boolean(this.walk||this.manual),stopping:!this.walk&&!this.manual,reducedMotion:this.reduceMotion});
    this.reachError=this.footwork.solve();this.swing=this.footwork.swing;
  }

  advanceMotion(delta){
    const previousX=this.x,previousY=this.y,previousYaw=this.yaw+this.turnOffset,action=this.walk;
    let dx=action?action.x-this.x:0,dy=action?action.y-this.y:0,distance=Math.hypot(dx,dy);
    if(action&&!action.arrived&&distance*this.unit<.0015){this.x=action.x;this.y=action.y;action.arrived=true;}
    const moving=Boolean(this.manual||action&&!action.arrived);
    const direction=this.manual||(action&&!action.arrived&&Math.abs(dx)>.1?Math.sign(dx):this.direction);
    if(moving)this.direction=direction;
    const targetYaw=moving?direction*Math.PI/2:action?.heading??this.faceHeading??-.12;
    const error=Math.atan2(Math.sin(targetYaw-this.yaw),Math.cos(targetYaw-this.yaw));
    const angularTarget=clamp(error*4.5,-1.9,1.9);
    this.angularSpeed+=clamp(angularTarget-this.angularSpeed,-delta*6,delta*6);
    const rotation=clamp(this.angularSpeed*delta,-Math.abs(error),Math.abs(error));
    this.yaw+=rotation;this.headingError=Math.atan2(Math.sin(targetYaw-this.yaw),Math.cos(targetYaw-this.yaw));
    const alignment=smooth(1-Math.abs(this.headingError)/.65),scale=(this.modelHeight||1.6)/1.6;
    const style=WALK_STYLES[this.walkStyle]||WALK_STYLES.v2;
    const cruise=(this.carrying?style.carrySpeed:style.speed)*scale;
    const braking=action?Math.sqrt(2*1.05*Math.max(0,distance*this.unit-.001)):cruise;
    const desired=moving?Math.min(cruise,braking)*alignment:0;
    const acceleration=desired>this.movementSpeed?.78:1.25;
    this.movementSpeed+=clamp(desired-this.movementSpeed,-delta*acceleration,delta*acceleration);
    if(action&&!action.arrived&&alignment>.02){
      const step=this.reduceMotion?distance:Math.min(distance,this.movementSpeed*delta/this.unit);
      if(distance>0){this.x+=dx/distance*step;this.y+=dy/distance*step;}
      if(step>=distance||Math.hypot(action.x-this.x,action.y-this.y)*this.unit<.0015){this.x=action.x;this.y=action.y;action.arrived=true;this.movementSpeed=0;}
    }else if(this.manual&&alignment>.02){
      this.x=this.clampPoint(this.x+this.manual*this.movementSpeed*delta/this.unit,this.y).x;
    }
    if(this.spin){const u=clamp((this.elapsed-this.spin.start)/this.spin.duration,0,1);this.turnOffset=this.spin.from+smooth(u)*TAU;if(u===1){this.spin=null;this.turnOffset%=TAU;}}
    else this.turnOffset=THREE.MathUtils.damp(this.turnOffset,0,8,delta);
    this.actor.rotation.y=this.yaw+this.turnOffset;
    this.turnRate=Math.atan2(Math.sin(this.yaw+this.turnOffset-previousYaw),Math.cos(this.yaw+this.turnOffset-previousYaw))/Math.max(delta,.001);
    this.velocity??=new THREE.Vector3();this.velocity.set((this.x-previousX)*this.unit/Math.max(delta,.001),0,0);
    this.motionState=moving?(alignment<.8?'turning':braking<cruise*.85?'braking':this.movementSpeed<cruise*.65?'starting':'walking'):Math.abs(this.headingError)>.03?'turning':'settling';
    return {moving,previousX,previousY};
  }
  animateFace(delta,gestureWeight){
    const t=this.elapsed,exp=this.vrm.expressionManager;if(!exp)return;
    if(t>=this.nextBlink){this.blinkStart=t;this.nextBlink=t+3+Math.random()*3.3;}
    const blinkAge=t-this.blinkStart,blink=blinkAge<.065?smooth(blinkAge/.065):1-smooth((blinkAge-.065)/.13);
    exp.setValue('blink',Math.max(0,blink));
    const voiceGate=this.speaking?(Math.sin(t*3.1)>.05?1:.18):0;
    const targets={happy:.055+(this.gesture==='wave'?.22*gestureWeight:0),relaxed:.04,aa:Math.max(0,Math.sin(t*12.7))*.24*voiceGate,ih:Math.max(0,Math.sin(t*9.3+1))*.11*voiceGate,oh:Math.max(0,Math.sin(t*7.7+2))*.12*voiceGate};
    for(const [name,target]of Object.entries(targets)){this.expression[name]=THREE.MathUtils.damp(this.expression[name]||0,target,14,delta);exp.setValue(name,this.expression[name]);}
  }

  tick(){
    this.frame=requestAnimationFrame(this.tick);const delta=Math.min(this.clock.getDelta(),.04);if(document.hidden)return;this.elapsed+=delta;
    const {moving}=this.advanceMotion(delta);
    const w=this.gait?.movingWeight||0;
    const pointerX=this.pointer.active?clamp((this.pointer.x*this.width-this.x)/this.width,-.5,.5)*.4:.015;
    const pointerY=this.pointer.active?clamp((this.pointer.y*this.areaHeight-(this.y-this.height*.91))/this.areaHeight,-.5,.5)*.2:0;
    this.look.x=THREE.MathUtils.damp(this.look.x,pointerX*(1-w)+clamp(this.headingError,-.4,.4)*.28,5,delta);
    this.look.y=THREE.MathUtils.damp(this.look.y,pointerY*(1-w*.7),5,delta);
    this.updatePosition();
    if(this.vrm){
      if(!this.footwork)this.seedFeet();
      this.gait=this.footwork.advance(delta,{velocity:this.velocity,turnRate:this.turnRate,moving,stopping:!moving,reducedMotion:this.reduceMotion});
      this.walkWeight=this.gait.movingWeight;this.gaitPhase=this.gait.stepWave;
      const gestureWeight=this.animateBody(delta);this.animateFace(delta,gestureWeight);
      this.eyeTarget.position.set(this.actor.position.x+this.look.x*1.5,this.actor.position.y+this.modelHeight*.92-this.look.y,2.5);
      this.actor.updateMatrixWorld(true);this.reachError=this.footwork.solve();this.swing=this.footwork.swing;
      this.vrm.update(delta);
      this.folder.material.opacity=THREE.MathUtils.damp(this.folder.material.opacity,this.carrying?1:0,10,delta);
      this.folder.visible=Boolean(this.folder.material.map)&&this.folder.material.opacity>.01;
      if(this.folder.visible){
        const left=this.vrm.humanoid.getRawBoneNode('leftHand'),right=this.vrm.humanoid.getRawBoneNode('rightHand');
        if(left&&right){left.getWorldPosition(this.folder.position);right.getWorldPosition(this.worldPoint);this.folder.position.add(this.worldPoint).multiplyScalar(.5);this.worldPoint.set(0,.055,.005).applyQuaternion(this.actor.quaternion);this.folder.position.add(this.worldPoint);this.folder.rotation.set(-.2,this.actor.rotation.y,0);}
      }
      const action=this.walk;
      if(action?.arrived){
        const settled=this.gait.settled&&Math.abs(this.headingError)<.025&&Math.abs(this.angularSpeed)<.08;
        action.stable=settled?action.stable+delta:0;
        if(action.stable>.08){this.walk=null;this.motionState='idle';action.resolve(true);}
      }else if(!moving&&this.gait.settled)this.motionState='idle';
      if(this.pendingGesture&&!this.walk&&this.gait.settled){const pending=this.pendingGesture;this.pendingGesture=null;this.play(pending.name,pending.duration);}
    }
    this.renderer.render(this.scene,this.camera);
  }
}
