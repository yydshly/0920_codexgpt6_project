# 工作室联动：实现边界与验收清单

依据：2026-09-22 只读审查 `dist/character.js`、`app.js`、`desktop.js`、`workspace-store.js`。未修改站点文件。

## 最小职责分工

- `WorkspaceStore` 仍是笔记、待办、文件与经典图标位置的唯一内容来源。工作室只是另一种视图，不复制或迁移用户内容。
- 新 `preferences.scene` 只允许 `classic` / `studio`；旧存档缺字段时默认经典，不提高存档 version，不将模式写入内容撤销历史。
- 工作室的站位单独保存在运行时。不能把家具或人物站位写进 `data.positions`，否则回经典桌面会覆盖用户摆放。
- `SimulatedDesktop` 的 `openObject / editNote / showDocument / showSummary / showSearch` 成功展示后，可统一发 `onViewChange({kind,id})`。这样文字指令与直接鼠标点击共用联动入口。
- UI 打开或内容保存必须先完成。人物动作独立播放，动作失败不能吞掉已完成的业务结果，也不能延迟打开窗口。

## 站位映射

| 业务目的 | 站位 | 到达动作 |
| --- | --- | --- |
| 浏览项目、收纳盒 | cabinet | reach |
| 笔记列表/编辑/保存、读取文件、搜索、提取和保存要点 | desk | think / nod |
| 待办列表、添加/完成待办 | board | reach / nod |
| 纯陪伴、挥手 | 当前站位 | 原地动作 |

如果当前站位已经是目标站位，直接原地回应。切换不同笔记、从原文切到要点、把要点保存为笔记都不应触发往返移动。

## 取消协议

`Avatar.moveTo()` 取消时 resolve(false)，因此不能只 await 后无条件 play。每次场景动作持有 `generation`，并在抵达后同时核对：`arrived === true`、`generation === currentGeneration`、当前模式仍是 studio。只有满足时，才更新 `currentStation` 和播放抵达动作。

统一 `cancelPresentation()`：代次加一、`avatar.cancel()`、取消点亮与目的地提示、将 presentationRunning 置 false。切换模式、换人物、停止、Esc、经典桌面拖拽、重置、开始替代动作都调用它。旧 Promise 的 finally 只在代次仍一致时清理 UI，避免清理新动作的状态。

业务 `busy` 与场景 `presentationRunning` 分开；停止按钮应在任一成立时显示。业务完成之后仍在走路，用户也能停止。

## 现有投影的实际边界

人物当前使用正视 XY 正交相机，根位移只有 x/y；y 位移不是 3D 地面的纵深。最小可靠改动是同一脚底高度的横向通道，所有家具交互站位在通道上，家具画在通道后方。不要先放一张有明显透视的房间图片，再让人物在任意 y 漂移。

后续若做真正前后走动，需要共同 3D 地面、倾斜相机、XZ 路径和障碍边界；这不是仅更换图片能解决的。

## 必测场景

1. 旧存档无 scene 字段仍能启动；模式切换两次后笔记、待办、文件数和经典图标坐标完全不变。
2. 切到 studio 再刷新仍恢复选择；存储被禁用时显示保存失败，页面本次体验仍可用，不能虚报“已记住”。
3. 点击项目柜，窗口立即出现；不依赖 VRM 加载完成，也不依赖走路完成。
4. 从项目柜打开笔记→编辑第二篇笔记→保存→搜索：只在第一次进入 desk 时走路，其余留在桌前。
5. 从 desk 创建待办：待办先保存并显示，人物随后去 board；连续添加两条不来回走。
6. 行走中点击另一个站位：旧到达动作不得补播，新路线从当前位置出发；不能先跳回旧站位。
7. 行走中切回经典：人物停止，旧 reach 和目的地提示不出现；切回 studio 不跳到旧动作终点。
8. 行走中停止或 Esc：业务已经保存的笔记保留，未执行的复合命令步骤取消；停止按钮可点击，即使业务已同步完成。
9. 行走中换人物：旧加载/动作无权覆盖新模型状态；新模型完成后依当前模式安排有效站位。
10. 切换模式时，正在编辑但尚未保存的正文仍在输入框中；不要通过重建 app-window 丢失草稿。
11. 经典模式图标拖动→studio→classic：位置不变；重置只重置经典布局，不删内容。
12. studio 的“整理桌面”不依次走向已隐藏的经典图标坐标；不得把用户图标位置无声重写成家具位置。
13. 窄屏和调整窗口尺寸：人物脚在同一可走地面；站位在可视区、不会被底部输入栏遮住；未使用过时的像素目标。
14. prefers-reduced-motion 下仍可使用全部能力，减少/跳过走路；不能卡住任务进度。
15. `read_simulated_desktop` 建议返回 `sceneMode / station / presentationRunning`，方便核对模式与联动状态；不暴露额外文件正文。

## 代码里的具体风险点

- `app.js runAction('open')` 目前先 `await walkTo` 再 `openObject`，应首先拆开。
- `app.js runAction('arrange')` 对四个图标串行 walking；工作室不能照搬这段隐藏图标路径。
- `character.js load()` 末尾会 `home()` 并 wave；人物切换后必须将当前场景重新应用，避免回到旧桌面位置。
- `character.js resize()` 会按窗口比例移动坐标，但未重算 `walk` 的目标；场景 resize 时应取消或重设目的地。
- `desktop.js openObject()` 会清空窗口手动位置；模式切换本身不需要重新打开对象，避免丢失正在填写的表单。
- `WorkspaceStore.commit({undo:false})` 已把最新 preferences/positions 同步进内容撤销快照，因此模式偏好可安全加入现有机制。
