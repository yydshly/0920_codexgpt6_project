export const WALK_STYLES=Object.freeze({
  v1:{number:'01',name:'最初步态',description:'保留早期的程序步行效果。',speed:.40,carrySpeed:.40},
  v2:{number:'02',name:'上一版步态',description:'保留上次的落脚与动画混合效果。',speed:.46,carrySpeed:.39},
  v3:{number:'03',name:'轻松步态',description:'身体更直立，脚步靠近重心，摆臂更轻。',speed:.46,carrySpeed:.39}
});
export const DEFAULT_WALK_STYLE='v3';
export const validWalkStyle=value=>Object.hasOwn(WALK_STYLES,value)?value:DEFAULT_WALK_STYLE;
