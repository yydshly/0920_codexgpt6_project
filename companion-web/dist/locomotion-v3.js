import {makeTwoBoneIK} from './two-bone-ik.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ease=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};

// V3 relaxed walking. Landing targets are balanced around the pelvis rather
// than around the rig's rest ankles (often several centimetres behind it).
// Support feet remain locked while the pelvis passes over them.
export class Footwork {
  constructor(THREE,actor,bones,hipPosition,modelHeight){
    Object.assign(this,{THREE,actor,bones,hipPosition,modelHeight});
    this.scale=modelHeight/1.6;this.nextFoot=0;this.stepNumber=0;
    this.state={stepWave:0,pelvisDrop:.0045*this.scale,lateral:0,forwardLean:0,settled:true,movingWeight:0,supportSide:null,swinging:false};
    this.seed();
  }
  seed(){
    const T=this.THREE;
    for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg','Foot'])this.bones[side+part]?.quaternion.identity();
    this.bones.hips.position.copy(this.hipPosition);this.actor.updateMatrixWorld(true);
    const heading=this.actor.getWorldQuaternion(new T.Quaternion());
    this.feet=['left','right'].map(side=>{
      const upper=this.bones[side+'UpperLeg'],lower=this.bones[side+'LowerLeg'],end=this.bones[side+'Foot'];
      const position=end.getWorldPosition(new T.Vector3()),quaternion=end.getWorldQuaternion(new T.Quaternion());
      return{side,position,flat:position.clone(),quaternion,baseQ:quaternion.clone(),heading:heading.clone(),
        rest:this.actor.worldToLocal(position.clone()),restQ:heading.clone().invert().multiply(quaternion),
        upperRest:this.actor.worldToLocal(upper.getWorldPosition(new T.Vector3())),
        ik:makeTwoBoneIK(T,upper,lower,end),pitch:0,landingPitch:0,stanceAge:1};
    });
    this.contacts=this.feet;
    this.restPelvis=this.actor.worldToLocal(this.bones.hips.getWorldPosition(new T.Vector3()));
    this.walkingCenterOffset=this.restPelvis.z-this.feet.reduce((sum,foot)=>sum+foot.rest.z,0)/this.feet.length;
    this.supportDuration=.07;
    this.swing=null;this.doubleSupport=0;this.floor=this.actor.position.y;this.reachError=0;this.lastSpeed=0;this.lastFoot=null;
    this.state={stepWave:0,pelvisDrop:.0045*this.scale,lateral:0,forwardLean:0,settled:true,movingWeight:0,supportSide:null,swinging:false};
  }
  neutral(foot){return this.actor.localToWorld(foot.rest.clone());}
  startStep(index,to,toHeading,duration,lift){
    const foot=this.feet[index];
    this.swing={index,age:0,duration,from:foot.flat.clone(),to,fromHeading:foot.heading.clone(),toHeading:toHeading.clone(),fromPitch:foot.pitch,lift,retargeted:false};
    this.nextFoot=1-index;this.lastFoot=index;this.stepNumber++;
  }
  advance(delta,{velocity,turnRate=0,moving=false,stopping=false,reducedMotion=false}={}){
    const T=this.THREE,dt=Math.min(Math.max(delta,0),.05),s=this.scale;
    this.actor.updateMatrixWorld(true);
    const heading=this.actor.getWorldQuaternion(new T.Quaternion()),vel=velocity?.clone()||new T.Vector3();vel.y=0;
    const speed=vel.length(),travelling=speed>.035*s,turning=Math.abs(turnRate)>.055;
    const floorDelta=this.actor.position.y-this.floor;this.floor=this.actor.position.y;
    for(const foot of this.feet){foot.flat.y+=floorDelta;foot.stanceAge+=dt;}
    if(this.swing){this.swing.from.y+=floorDelta;this.swing.to.y+=floorDelta;}
    this.doubleSupport=Math.max(0,this.doubleSupport-dt);

    if(this.swing){
      const swing=this.swing,foot=this.feet[swing.index];
      // A cancelled/braked walk lands close to the stopped body, rather than
      // completing an obsolete stride far beyond it.
      if((stopping||!travelling)&&speed<.10*s&&!swing.retargeted){
        swing.from.copy(foot.flat);swing.to.copy(this.neutral(foot));swing.fromHeading.copy(foot.heading);swing.toHeading.copy(heading);
        swing.fromPitch=foot.pitch;swing.duration=Math.max(.14,swing.duration-swing.age);swing.age=0;swing.lift*=.4;swing.retargeted=true;
      }
      swing.age+=dt;const u=clamp(swing.age/swing.duration,0,1),blend=ease(u);
      foot.flat.lerpVectors(swing.from,swing.to,blend);foot.flat.y+=Math.sin(Math.PI*u)*swing.lift;
      foot.heading.slerpQuaternions(swing.fromHeading,swing.toHeading,blend);
      const toeOff=.13*Math.sin(Math.PI*clamp(u/.55,0,1));
      const heel=-.065*ease((u-.55)/.45);
      foot.pitch=swing.fromPitch*(1-ease(u/.22))+toeOff+heel;
      this.state.stepWave=(swing.index===0?-1:1)*Math.cos(Math.PI*u);
      if(u===1){foot.flat.copy(swing.to);foot.heading.copy(swing.toHeading);foot.landingPitch=foot.pitch;foot.stanceAge=0;this.swing=null;this.doubleSupport=travelling?this.supportDuration:.06;}
    }

    if(!this.swing&&this.doubleSupport===0){
      const duration=travelling?.385-.035*clamp(speed/(.55*s),0,1):turning?.28:.29;
      // After this swing, the new support foot will wait through double
      // support and the next swing. Land ahead by half that stance travel,
      // so the pelvis crosses the ankle halfway through support.
      const lead=travelling?duration+duration*.5+this.supportDuration:0;
      const forward=new T.Vector3(0,0,1).applyQuaternion(heading);
      const candidates=this.feet.map((foot,index)=>{
        const neutral=this.neutral(foot),to=neutral.clone();
        if(travelling)to.addScaledVector(forward,this.walkingCenterOffset);
        to.addScaledVector(vel,lead);
        const offset=to.clone().sub(neutral);if(offset.length()>.24*this.modelHeight)to.copy(neutral).add(offset.setLength(.24*this.modelHeight));
        return{index,to,error:foot.flat.distanceTo(neutral),angle:foot.heading.angleTo(heading)};
      });
      let next=candidates[this.nextFoot];
      if(!travelling){next=candidates.reduce((a,b)=>a.error+a.angle*.08>b.error+b.angle*.08?a:b);}
      const needsStep=travelling?(next.error>.03*s||next.angle>.12):(next.error>.017*s||next.angle>.11);
      if(needsStep){
        this.startStep(next.index,next.to,heading,reducedMotion?.10:duration,reducedMotion?.004:.0165*this.modelHeight*(travelling?1:.7));
      }
    }

    for(let index=0;index<this.feet.length;index++){
      const foot=this.feet[index];
      if(this.swing?.index!==index)foot.pitch=foot.landingPitch*(1-ease(foot.stanceAge/.11));
      this.rollFoot(foot);
    }
    const support=this.swing?this.feet[1-this.swing.index]:null;
    const lateralTarget=support?clamp(support.rest.x*.14,-.008*s,.008*s):0;
    this.state.lateral=T.MathUtils.damp(this.state.lateral,lateralTarget,12,dt);
    // Near straight at mid-stance, just enough flex for the actual trailing
    // leg. A constant crouch is not a replacement for reach-aware footwork.
    let drop=.0045*s;
    for(const foot of this.feet){
      const hipLocal=foot.upperRest.clone();hipLocal.x+=this.state.lateral;
      const hip=this.actor.localToWorld(hipLocal),dx=hip.x-foot.position.x,dz=hip.z-foot.position.z;
      const reach=foot.ik.reach-.001*s,vertical=Math.sqrt(Math.max(.01,reach*reach-dx*dx-dz*dz));
      drop=Math.max(drop,hip.y-foot.position.y-vertical+.001*s);
    }
    drop=clamp(drop,.0045*s,.034*s);
    this.state.pelvisDrop=Math.max(drop,T.MathUtils.damp(this.state.pelvisDrop,drop,13,dt));
    this.state.movingWeight=T.MathUtils.damp(this.state.movingWeight,clamp(speed/(.44*s),0,1),9,dt);
    const acceleration=(speed-this.lastSpeed)/Math.max(dt,.001);this.lastSpeed=speed;
    this.state.forwardLean=T.MathUtils.damp(this.state.forwardLean,clamp(acceleration*.004,-.008,.008),8,dt);
    this.state.supportSide=support?.side||null;this.state.swinging=Boolean(this.swing);this.state.phase=this.swing?this.swing.age/this.swing.duration:1;
    this.state.settled=!this.swing&&!travelling&&!turning&&this.feet.every(foot=>foot.flat.distanceTo(this.neutral(foot))<.022*s&&foot.heading.angleTo(heading)<.13&&Math.abs(foot.pitch)<.015);
    if(this.state.settled){this.state.stepWave=T.MathUtils.damp(this.state.stepWave,0,9,dt);}
    return this.state;
  }
  rollFoot(foot){
    const T=this.THREE,right=new T.Vector3(1,0,0).applyQuaternion(foot.heading),forward=new T.Vector3(0,0,1).applyQuaternion(foot.heading);
    const roll=new T.Quaternion().setFromAxisAngle(right,foot.pitch);
    // Roll about a heel/toe contact, not around a floating ankle. Pivot
    // compensation keeps the sole from cutting into the floor.
    const pivot=forward.multiplyScalar((foot.pitch>0?.072:-.027)*this.modelHeight);pivot.y-=.048*this.modelHeight;
    const correction=pivot.clone().sub(pivot.clone().applyQuaternion(roll));
    foot.position.copy(foot.flat).add(correction);foot.baseQ.copy(foot.heading).multiply(foot.restQ);foot.quaternion.copy(roll).multiply(foot.baseQ);
  }
  solve(){
    const T=this.THREE,forward=new T.Vector3(0,0,1).applyQuaternion(this.actor.getWorldQuaternion(new T.Quaternion()));
    // Upper-body pose blending and a heading change happen after advance().
    // Re-check the actual posed hip sockets before IK: the rest-pose estimate
    // must not stretch a planted leg when the pelvis rotates during arrival.
    let extraDrop=0;
    for(const foot of this.feet){
      const hip=this.bones[foot.side+'UpperLeg'].getWorldPosition(new T.Vector3());
      const dx=hip.x-foot.position.x,dz=hip.z-foot.position.z,reach=foot.ik.reach-.0007*this.scale;
      const vertical=Math.sqrt(Math.max(0,reach*reach-dx*dx-dz*dz));
      if(hip.y>foot.position.y)extraDrop=Math.max(extraDrop,hip.y-foot.position.y-vertical);
    }
    extraDrop=clamp(extraDrop,0,.018*this.scale);
    if(extraDrop>0){
      const hips=this.bones.hips,position=hips.getWorldPosition(new T.Vector3());position.y-=extraDrop;
      if(hips.parent)hips.parent.worldToLocal(position);hips.position.copy(position);
      this.state.pelvisDrop+=extraDrop;this.actor.updateMatrixWorld(true);
    }
    this.state.postPoseDrop=extraDrop;
    this.reachError=0;
    for(const foot of this.feet){const hip=this.bones[foot.side+'UpperLeg'].getWorldPosition(new T.Vector3());this.reachError=Math.max(this.reachError,foot.ik.solve(foot.position,hip.add(forward),foot.quaternion));}
    return this.reachError;
  }
}

