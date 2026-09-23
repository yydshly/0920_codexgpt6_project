import {makeTwoBoneIK} from './two-bone-ik.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const TAU=Math.PI*2;

// Restored from the v0.4 character.js seedFeet/plantFeet and gait-clock source
// captured in this task before locomotion.js existed. This is the original
// procedural core adapted to the current Footwork interface, not a complete
// byte-for-byte application snapshot. Intentionally preserves its short steps,
// velocity-following targets, flat ankles and constant crouch for comparison.
export const restoration={version:'v0.4',kind:'restored-core-with-api-adapter',swingDuration:.29,doubleSupport:.035,prediction:.16};

export class Footwork {
  constructor(THREE,actor,bones,hipPosition,modelHeight){
    Object.assign(this,{THREE,actor,bones,hipPosition,modelHeight});this.seed();
  }
  seed(){
    const T=this.THREE;
    for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg','Foot'])this.bones[side+part]?.quaternion.identity();
    this.bones.hips.position.copy(this.hipPosition);this.actor.updateMatrixWorld(true);
    const actorQ=this.actor.getWorldQuaternion(new T.Quaternion());
    this.feet=['left','right'].map(side=>{
      const foot=this.bones[side+'Foot'],position=foot.getWorldPosition(new T.Vector3()),quaternion=foot.getWorldQuaternion(new T.Quaternion());
      return{side,position,flat:position,quaternion,rest:this.actor.worldToLocal(position.clone()),restQ:actorQ.clone().invert().multiply(quaternion),
        heading:actorQ.clone(),pitch:0,ik:makeTwoBoneIK(T,this.bones[side+'UpperLeg'],this.bones[side+'LowerLeg'],foot)};
    });
    this.contacts=this.feet;this.swing=null;this.doubleSupport=0;this.floor=this.actor.position.y;
    this.phase=0;this.walkWeight=0;this.reachError=0;this.stepNumber=0;this.lastFoot=null;
    this.state={stepWave:0,phaseAngle:0,pelvisDrop:.026,lateral:0,forwardLean:0,settled:true,movingWeight:0,supportSide:null,swinging:false,phase:1};
  }
  neutral(foot){return this.actor.localToWorld(foot.rest.clone());}
  advance(delta,{velocity,turnRate=0,reducedMotion=false}={}){
    const T=this.THREE,dt=Math.min(Math.max(delta,0),.05),vel=velocity?.clone()||new T.Vector3();vel.y=0;
    const speed=vel.length(),actorQ=this.actor.getWorldQuaternion(new T.Quaternion());
    // The original arms were distance-driven, independently of planted feet.
    this.phase+=speed*dt/.28*TAU;
    this.walkWeight=T.MathUtils.damp(this.walkWeight,clamp(speed/.40,0,1),10,dt);
    const dy=this.actor.position.y-this.floor;this.floor=this.actor.position.y;
    for(const foot of this.feet)foot.position.y+=dy;
    if(this.swing){this.swing.from.y+=dy;this.swing.to.y+=dy;}
    if(this.swing){
      const s=this.swing;s.age+=dt;const u=clamp(s.age/s.duration,0,1),e=smooth(u),foot=this.feet[s.index];
      foot.position.lerpVectors(s.from,s.to,e);foot.position.y+=Math.sin(u*Math.PI)*this.modelHeight*.027;
      foot.quaternion.slerpQuaternions(s.fromQ,s.toQ,e);
      if(u===1){this.swing=null;this.doubleSupport=.035;}
    }
    this.doubleSupport-=dt;
    if(!this.swing&&this.doubleSupport<=0){
      const candidates=this.feet.map((foot,index)=>{
        const to=this.neutral(foot).addScaledVector(vel,.16),toQ=actorQ.clone().multiply(foot.restQ);
        return{index,to,toQ,error:foot.position.distanceTo(to),angle:foot.quaternion.angleTo(toQ)};
      });
      candidates.sort((a,b)=>(b.error+b.angle*.06)-(a.error+a.angle*.06));
      const next=candidates[0];
      if(next.error>(this.walkWeight>.1?.045:.026)||next.angle>.22){
        const foot=this.feet[next.index];
        this.swing={...next,age:0,duration:reducedMotion?.04:.29,from:foot.position.clone(),fromQ:foot.quaternion.clone()};
        this.lastFoot=next.index;this.stepNumber++;
      }
    }
    for(const foot of this.feet)foot.heading.copy(foot.quaternion).multiply(foot.restQ.clone().invert());
    const w=this.walkWeight;
    Object.assign(this.state,{
      stepWave:Math.sin(this.phase),phaseAngle:this.phase,movingWeight:w,
      pelvisDrop:.026+.018*w-Math.abs(Math.sin(this.phase*2))*.005*w,
      lateral:0,forwardLean:0,supportSide:this.swing?this.feet[1-this.swing.index].side:null,
      swinging:Boolean(this.swing),phase:this.swing?this.swing.age/this.swing.duration:1,
      // Adapter-only completion signal: it uses the old replant tolerances so
      // the modern arrival controller does not wait for a tighter v2 stance.
      settled:!this.swing&&speed<.01&&Math.abs(turnRate)<.055&&this.feet.every(foot=>foot.position.distanceTo(this.neutral(foot))<=.0261&&foot.quaternion.angleTo(actorQ.clone().multiply(foot.restQ))<=.2201),
    });
    return this.state;
  }
  solve(){
    const T=this.THREE,forward=new T.Vector3(0,0,1).applyQuaternion(this.actor.getWorldQuaternion(new T.Quaternion()));
    this.reachError=0;
    for(const foot of this.feet){const hip=this.bones[foot.side+'UpperLeg'].getWorldPosition(new T.Vector3());this.reachError=Math.max(this.reachError,foot.ik.solve(foot.position,hip.add(forward),foot.quaternion));}
    return this.reachError;
  }
}
