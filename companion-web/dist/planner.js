const action=(kind,label,args={})=>({kind,label,args});
const clean=text=>text.trim().replace(/[。！!]+$/,'').trim();
export function planCommand(input){
  const steps=parseCommand(String(input||'').slice(0,2000));
  return steps.length>8?[action('reply','任务太长',{text:'一次最多安排 8 个步骤，请拆成两次。'})]:steps;
}
function parseCommand(input){
  const raw=String(input||'').trim();let text=clean(raw).replace(/^先(?=整理|打开|提取|搜索)/,'');if(!text)return[];
  if(/^(?:请)?(?:停(?:止|下|一下)|取消(?:任务)?|别动|stop)$/i.test(text))return[action('stop','停止当前任务')];
  if(/^(?:请)?(?:撤销|恢复)(?:上一步|刚才的操作|整理|位置|桌面整理)?$/.test(text))return[action('undo','撤销上一步')];
  // Capture free-form content before looking for command words or separators.
  const payloads=[[/^(?:帮我)?(?:添加|新增|新建)(?:一个|一条)?待办/,'add_todo','添加待办','title'],[/^(?:帮我)?(?:记下|记录|新建笔记|添加笔记|保存笔记)/,'create_note','保存笔记','body'],[/^(?:以后)?叫我/,'nickname','记住你的称呼','name'],[/^(?:帮我)?(?:搜索|查找|找一下|找找)\s*[：:]/,'search','搜索记录','query'],[/^(?:完成|勾选)(?:待办)?\s*[：:]/,'complete_todo','完成待办','query'],[/^(?:删除|移除)待办\s*[：:]/,'remove_todo','移除待办','query']];
  for(const [prefix,kind,label,key] of payloads){if(prefix.test(raw)){const payload=raw.replace(prefix,'').replace(/^\s*[：:]?\s*/,'').trim();return payload?[action(kind,label,{[key]:payload})]:[action('reply','等待内容',{text:'请在冒号后填写内容。'})];}}
  let m;
  if(/^(?:请)?(?:不要|别|不用|不必|先不|暂不)/.test(text))return[action('reply','保持现状',{text:'好，这次不执行操作。'})];
  const separator=/(?:[；;]|[，,]?然后[，,]?|[，,]再)/.exec(raw);
  if(separator)return[...parseCommand(raw.slice(0,separator.index)),...parseCommand(raw.slice(separator.index+separator[0].length).replace(/^再/,''))];
  if(/^(?:帮我|请)?(?:整理|排列|摆整齐)(?:一下)?(?:桌面|图标|桌面图标)?$/.test(text))return[action('arrange','整理桌面图标')];
  if(/^(?:帮我|请)?(?:打开|看看|查看)(?:一下)?(?:我的)?项目(?:文件夹)?$/.test(text)||text==='陪我开工')return[action('open','打开我的项目',{id:'projects'})];
  if(/^(?:帮我|请)?(?:打开|看看|查看)(?:一下)?(?:我的)?(?:便签|笔记|灵感便签)(?:\.txt)?$/.test(text))return[action('open','打开笔记',{id:'notes'})];
  if(/^(?:帮我|请)?(?:打开|看看|查看)(?:一下)?(?:我的)?(?:待办|清单|今日待办)$/.test(text))return[action('open','查看待办',{id:'todos'})];
  if(/^(?:帮我|请)?(?:打开|看看|查看)(?:一下)?(?:收纳盒|文件|资料|文件库)$/.test(text))return[action('open','打开文件库',{id:'collection'})];
  if(/^(?:打开|查看)(?:这个|选中的|选中文件)$/.test(text))return[action('open_selected','打开选中的对象')];
  m=text.match(/^(?:帮我)?(?:搜索|查找|找一下|找找)[：:\s]*(.+)$/);if(m)return[action('search',`搜索“${m[1]}”`,{query:m[1]})];
  m=text.match(/^(?:完成|勾选)(?:待办)?[：:\s]*(.+)$/);if(m)return[action('complete_todo','完成待办',{query:m[1]})];
  m=text.match(/^(?:删除|移除)待办[：:\s]*(.+)$/);if(m)return[action('remove_todo','移除待办',{query:m[1]})];
  if(/^(?:帮我)?(?:提取|总结|概括)(?:这个|当前|选中的|刚才的)?(?:文件|文档|文本)?(?:的)?(?:要点|重点|摘要)?$/.test(text))return[action('summarize','提取原文要点')];
  if(/^(?:把)?(?:这些|刚才的|当前)?(?:要点|摘要)(?:保存|存)(?:为|成|到)?(?:笔记|便签)$/.test(text)||/^(?:保存为笔记|保存要点)$/.test(text))return[action('save_summary','把要点保存为笔记')];
  if(/^(?:打个招呼|你好|嗨|挥手|hello|hi)$/i.test(text))return[action('gesture','向你打招呼',{gesture:'wave'})];
  if(/^(?:点头|点个头)$/.test(text))return[action('gesture','点头回应',{gesture:'nod'})];
  if(/^(?:伸懒腰|伸个懒腰|舒展一下)$/.test(text))return[action('gesture','伸个懒腰',{gesture:'stretch'})];
  if(/^(?:想一想|思考一下)$/.test(text))return[action('gesture','想一想',{gesture:'think'})];
  if(/^(?:安静|安静陪我|专注模式)$/.test(text))return[action('quiet','安静陪伴',{enabled:true})];
  if(/^(?:互动模式|活泼一点)$/.test(text))return[action('quiet','恢复互动',{enabled:false})];
  if(/^(?:近看|近看人物|靠近一点)$/.test(text))return[action('closeup','近看人物')];
  if(/^(?:转身|转一圈)$/.test(text))return[action('turn','转一圈')];
  if(/^(?:往左|左边|向左)$/.test(text))return[action('move','向左走',{direction:-1})];
  if(/^(?:往右|右边|向右)$/.test(text))return[action('move','向右走',{direction:1})];
  if(/^(?:你会什么|能做什么|帮助|能力)$/.test(text))return[action('help','打开能力面板')];
  return[action('unknown','需要更明确的指令',{text})];
}
