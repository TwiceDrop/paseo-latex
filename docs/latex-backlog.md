# Paseo LaTeX 待改清单

后续反馈先登记为待改项，用户要求开始修改时再实施。
用户反馈与实际复现结果分别记录；未验证的原因不写成结论。

## LATEX-001：侧边栏单个聊天拖动排序失效

- [x] 恢复侧边栏单个聊天的拖动排序功能。
- 反馈日期：2026-10-29。
- 受影响平台：Windows、Android。
- 用户反馈：原版 Paseo 支持拖动侧边栏中的单个聊天来调整顺序，LaTeX 版在两个平台上均失效。
- 预期：两个平台均恢复与原版一致的聊天拖动排序交互。
- 实施日期：2026-11-06，随官方 `v0.15.2` 同步更新。
- 已复现：按项目分组、默认“创建时间”排序时，普通聊天行未启用拖拽组件；真实浏览器用例在拖拽激活检查处失败，项目标题仍可拖动。
- 修复：普通聊天行始终支持拖动；顺序实际改变后保存为“手动”排序，沿用 Windows 与 Android 各自的拖拽组件。取消或原位放下保持原排序模式。
- 验证：修复前失败的浏览器用例已通过；8 项侧边栏场景覆盖鼠标与触摸拖拽、刷新持久化、取消和原位放下、自动排序切换、隐藏条目与其他项目顺序、折叠项目恢复、项目和置顶聊天拖拽。已接入现有 LaTeX Source Build CI 并保存测试录像。
- [ ] Windows 与 Android 真机验收：分别拖动单个聊天，检查滚动、长按菜单和侧栏开关手势；当前云环境未进行真机验证。

## LATEX-002：文档预览资源按需加载

- [x] 随官方 `v0.15.3` 同步更新，优化 Windows 与 Android 初始文档资源负担。
- 请求与实施日期：2026-11-08。用户要求继续寻找性能优化点并直接发布。
- 已测问题：初始桌面 JavaScript 和 Android Hermes 字节码内嵌所有文档解析器；即使只预览纯文本，也会构造约 5.93 MB 的预览 HTML。
- 改动：按文档格式打包本地资源，打开可见预览时才读取对应解析器。相同格式的保留面板共享资源，关闭最后一个面板后释放 HTML 缓存；加载失败可单独重试，避免重复传输已读取的文档。离线支持与隔离约束见 [LaTeX 客户端说明](latex-client.md)。
- 同条件测量：基线为合并官方 `v0.15.3` 后的 `cf73ff7564fc56eb76302d7eb3d85ca63959cb6d`；两次使用 Node 22、`APP_VARIANT=latex`、单 Metro worker 和生产 Expo export，桌面额外设置 `PASEO_WEB_PLATFORM=electron`。数据为未压缩文件字节数。

| 测量对象                      |       优化前 |       优化后 |   减少 |
| ----------------------------- | -----------: | -----------: | -----: |
| 桌面初始 JavaScript           | 30,118,220 B | 24,080,915 B | 20.05% |
| Android Hermes 生产导出字节码 | 38,708,312 B | 26,861,456 B | 30.61% |

- 导出依赖图中已移除旧的内嵌文档模块，六种 HTML 资源分别随包提供；字节码检查同时覆盖 UTF-8 与 UTF-16 字符串。文本解析资源为 4,763 B，PDF 字体、CMaps 和 WASM 仅包含在 PDF 资源中。
- 回归证据：16 KiB 文本预览预算用例修复前失败、修复后通过；5 项真实浏览器解析测试、3 项真实应用测试通过，涵盖格式按需请求、后台切换保留页码、资源失败后重试且不重复读取文件。已有 CI 同时运行文档、公式与侧边栏回归并保存录像。
- [ ] Windows 与 Android 真机性能验收：冷启动到可用聊天、进程总内存、首次打开各类文档与持续滚动。本次云环境无已连接 Android 设备；以上字节码使用 Expo 生产导出参数，不能视为真机速度、内存或安装包体积的同比提升。
- [x] 2026-11-15：Mermaid 运行时改成安装包内按需加载的 HTML，共享并释放资源缓存；移除未使用的旧公式 WebView 链路。生产包数据和验证边界见[插件择优与补丁边界](latex-plugin-decisions.md)。保留工作区与流式消息的实体设备性能仍待同机基线。

## LATEX-003：CNB 国内更新源

- 用户要求先调研 CNB 国内更新方式，并配置新仓库迁移。目标仓库：`https://cnb.cool/twicedrop/paseo-latex`。
- 调研：公开版本信息可通过 CNB 网页域名的 `/-/releases/latest` 配合 `Accept: application/json` 获取；下载使用 `/-/releases/download/<tag>/<filename>`。API 写入需要限定仓库的访问令牌，代码同步需要 `repo-code:rw`，Release 上传需要 `repo-release:rw`。
- [x] 编写源码与既有 Release 同步流程：只同步正式分支与个人标签，校验 GitHub 哈希、校验清单及 CNB 下载内容后发布；重复运行不会覆盖不同内容的同名附件。操作见 [客户端说明](latex-client.md#cnb-source-and-release-mirror)。
- [x] 2026-11-13 完成首次远端同步与公开下载验证：[CNB `latex-v0.15.3-r1`](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.3-r1) 已正式发布 Windows x64、Android ARM64 和校验清单。两个正式分支、四个个人标签已同步；版本标签仍指向原构建源码 `5fac87c6c7e6608814aac920d8071b535caf07df`。33 项同步与工作流检查通过，上传后及匿名下载的 SHA-256 均与 GitHub 一致，见 [迁移验证记录](https://github.com/TwiceDrop/paseo-latex/actions/runs/43366148096)。
- [x] 实施客户端更新器接入：Windows 使用 CNB generic feed、独立缓存与完整下载，按上游版本和个人修订比较；Android 在“设置 → 关于”检查更新，由原生模块流式下载、核验哈希/包名/版本/签名，再打开系统安装器。原应用标识、NSIS GUID、Android 签名与主机协议版本保持兼容。
- [x] 2026-11-13 发布 `0.15.3-r2`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.3-r2) 与 [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.3-r2) 均包含 Android ARM64 APK、Windows x64 EXE、`latest.yml`、`SHA256SUMS.txt`。两个安装包来自同一源码 `5e8137fa1d1e79843a3371bde0338ef81950a43e`；旧版需手动覆盖安装本版一次才能获得更新器。
- 验证：[最终构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43375549624) 完成 344 项定向与界面检查、两个平台编译；Windows 使用真实 Electron 验证实际 EXE 下载及损坏文件拒绝，另已核对包内 CNB 地址与个人修订号。Android 沿用原证书，发布时复核包名、版本名和 `versionCode=1500302`。[CNB 发布校验](https://github.com/TwiceDrop/paseo-latex/actions/runs/43381191913) 验证四个附件上传后及匿名下载的完整哈希；客户端解析器确认最新 APK 为 `0.15.3-r2`，Windows 清单为 `0.15.3-latex.2`，其 SHA-512 与构建产物一致。
- [ ] Windows 与 Android 真机覆盖安装、系统安装权限交互及国内网络验收。云端已覆盖取消、失败重试、损坏文件拒绝和安装权限界面状态；这些检查不等同于真机系统安装器验证或国内速度实测。

## LATEX-004：同步官方 0.15.4

- 用户要求同步官方 `v0.15.4` 并保留个人补丁。
- [x] 合并官方发布标签 `v0.15.4`（`1c00b365c9e0b74c1580eba33d905d693125ae21`）：新增 Fable 5.2、Mythos 5.2，默认 medium 推理强度；两者要求 Claude Code ≥ 2.1.321，Mythos 5.2 仍需主机发现有效访问权限。
- [x] 保留 LaTeX、文档预览按需加载、下载、侧边栏排序、独立应用标识及 CNB 更新器；沿用原 Android 证书和 Windows NSIS GUID。
- [x] 2026-11-13 完成回归与双平台构建，发布 `0.15.4-r1`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.4-r1) 与 [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.4-r1) 均包含 Windows x64、Android ARM64、`latest.yml` 和 `SHA256SUMS.txt`。两个安装包来自同一源码 `cd1553746c1525807d8e017a9673b6229be83ab6`；`0.15.3-r2` 用户可使用 CNB 更新器升级。
- 验证：[发布构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43384735456) 通过 566 项定向与界面检查；本地另通过 13 项提供方集成检查。Windows 实际 EXE 的下载校验、损坏文件拒绝及包内 CNB 配置均已核对；[发布任务](https://github.com/TwiceDrop/paseo-latex/actions/runs/43389825643) 复核 Android 原证书、包名及 `versionCode=1500401`。[CNB 镜像校验](https://github.com/TwiceDrop/paseo-latex/actions/runs/43389927231) 确认四个附件上传后与公开下载的 SHA-256 均匹配 GitHub；客户端解析器识别 `0.15.4-r1`，Windows 清单为 `0.15.4-latex.1` 且 SHA-512 匹配实际 EXE，均高于上一版。
- [ ] Windows 与 Android 真机覆盖安装、主机配对和新模型实际调用验收；自动化目录测试不能替代真实模型访问资格和设备验证。

## LATEX-005：修复 Windows CNB 更新器首次检查失败

- 用户在 Windows `0.15.3-r2` 的“关于 → 应用更新”看到 `Cannot read properties of null (reading 'request')`，并要求修复 `0.15.3`，以测试升级到新版。
- [x] 复现：提供自定义 AppAdapter 后，electron-updater 不会创建 HTTP executor；构造时先设置 feed 导致 provider 保存 null，之后补设 executor 无法更新它。修正为先创建 executor，再设置 feed；与已连接 Host 的版本差异无关。
- [x] 调整现有测试，保留首次创建的 CNB provider，不再通过重设 feed 掩盖错误。已发布 `0.15.4-r1` EXE 内的旧代码在真实 Electron 中复现同一异常；修复后通过首次检查、完整下载与损坏文件拒绝，未执行安装。
- [x] 2026-11-13 发布 `0.15.4-r2`（[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.4-r2) / [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.4-r2)）与回移修复的 `0.15.3-r3`（[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.3-r3) / [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.3-r3)）。两版均提供 Windows x64、Android ARM64、更新清单和校验文件；最新更新目标保持 `0.15.4-r2`，旧维护版不提升为 latest。
- 验证：[0.15.4-r2 构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43394256955) 通过 566 项检查，[0.15.3-r3 构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43394261116) 通过 344 项检查；两份实际 EXE 内的更新器代码与修复构建一致，并在真实 Electron 中通过首次请求、完整下载及损坏拒绝检查。Android 两版沿用原证书，版本码分别为 `1500402`、`1500303`。[新版镜像](https://github.com/TwiceDrop/paseo-latex/actions/runs/43400949547) 与 [维护版镜像](https://github.com/TwiceDrop/paseo-latex/actions/runs/43401935132) 校验全部公开附件；客户端和 Windows 清单确认从 `0.15.3-r3` 升级到 `0.15.4-r2`，且发布维护版后 latest 未回退。
- [ ] 用户在 Windows 手动覆盖安装 `0.15.3-r3` 后，实测通过 CNB 更新到最新版（当前 `0.15.4-r4`）。已安装的错误更新器不能靠服务端替换清单修复；Android 不受该初始化问题影响。

## LATEX-006：兼容官方 Host 的跨设备聊天附件

- 反馈与实施日期：2026-11-13。
- 用户反馈：同一个 Host、同一个 Codex 会话，本机发出的图片和其他附件在另一台设备上只剩文字。Host 使用官方桌面客户端及 CLI，要求保留官方 Host。
- 代码排查：用户消息协议和 Codex 历史适配只输出文字与消息 ID，原发送端依赖本地附件缓存；这能解释现象，不代表 Codex 未收到图片。
- [x] 只修改个人客户端，复用官方文件接口保存附件和消息索引；覆盖普通发送、新建会话首条消息及队列发送。
- [x] 第二台客户端按消息 ID 恢复缩略图、文件预览入口；重连和历史重新加载后仍可读取。
- [x] 原发送端打开旧消息时补存仍可读取的附件；缓存已丢失的旧附件不承诺恢复。
- 验证：附件、发送及翻译定向单测共 96 项通过；普通会话与新建会话的独立浏览器验证通过，覆盖第二端无本地消息/图片缓存、放大图片、刷新和文件预览入口。未修改的官方 npm Host `0.15.4` 已验证双客户端读取及重启恢复；全仓库 lint、App 类型检查通过。
- Android 兼容复核：读取队列使用原生 `AbortSignal.aborted`，不调用 React Native `abort-controller` 缺少的 `throwIfAborted()`；已用该原生依赖验证正常读取、排队取消及后续队列继续执行。
- 云端回归：[最终构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43430331377) 的客户端定向单测 344 项、文档与公式浏览器测试 13 项、侧边栏及文档预览端到端测试 11 项均通过；三个附件兼容用例首次通过，无需重试。Host 模型及功能门控 222 项、桌面更新器 38 项检查通过，客户端类型检查、全仓库 lint、网页导出及格式检查通过。
- 测试稳定性：首轮云端文件预览断言曾超时一次，重试通过；随后本地三个独立浏览器重复运行及最终云端运行全部通过，保留此记录供后续复核。
- [x] 2026-11-13 完成双平台构建并发布 `0.15.4-r3`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.4-r3) 与 [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.4-r3) 均提供 Windows x64、Android ARM64、更新清单和校验文件。两个安装包来自源码 `14c8b59df64ad7c321953fc338d39daf26ffe133`，沿用原应用身份及 Android 签名；[发布工作流](https://github.com/TwiceDrop/paseo-latex/actions/runs/43438105169) 已复核源码、签名和版本码。
- 发布验证：[CNB 镜像任务](https://github.com/TwiceDrop/paseo-latex/actions/runs/43438222924) 校验四个附件上传后及公开下载的完整 SHA-256，与 GitHub 一致。实际客户端解析器确认 latest 为 `0.15.4-r3`、Android `versionCode=1500403`；Windows 清单为 `0.15.4-latex.3`，下载地址固定到本次标签。Windows 包内更新器通过真实 Electron 的首次请求、完整下载及损坏拒绝检查。未进行 Windows、Android 真机操作验证。

- 存储位置、兼容边界及保留策略见 [共享聊天附件](latex-client.md#shared-chat-attachments-with-official-hosts)。

## LATEX-007：插件择优、渲染资源优化与可重放补丁

- [x] 2026-11-15 完成[逐项比较与取舍](latex-plugin-decisions.md)：公式保留原生 RaTeX/Web KaTeX；Office 保留页面/幻灯片版式；高级 PDF 使用官方文件面板插件入口；保留官方 Host 附件兼容、现有连接下载、侧边栏修补和 CNB 分发。
- [x] Mermaid 运行时移为安装包内按需 HTML，首个图表才读取，全屏复用，最后一个使用者退出后清理查询缓存；加载失败保留源码并支持重试。删除 19 个未使用的旧数学渲染文件及旧依赖。
- [x] 相同参数的生产导出：Web 主入口 `24,061,325 → 20,484,677` 字节（减少 14.86%），Android Hermes `31,600,445 → 24,672,245` 字节（减少 21.92%）；单独 HTML 资源仍打包，不能等同安装包缩小比例或真机性能提升。
- [x] `latex:patches export/check` 提供基准/源码 SHA、完整二进制补丁、功能索引与校验；实际 212 个路径重放到官方 `v0.15.4` 后得到完全相同的源码树。`latex:update --dry-run` 在临时索引预检，拒绝旧基准回退；迁移与 CI 共用 `latex:verify` 定向回归。
- [x] 本地 438 项单元、68 项浏览器、6 项隔离 Host 场景、38 项工具检查通过；全工作区类型及 lint 检查通过。首次云端附件用例暴露自动滚动点击与末尾定位的竞争：录像显示目标离开点击位置，且未发出文件读取。改为先模拟用户滚轮、确认进入视口再点击，保留原下载断言；本地三次独立会话和第二轮云端附件检查通过。
- 云端源码检查：438 项客户端单元、68 项浏览器、14 项导航/文档/Mermaid 场景、3 项附件兼容场景通过，另通过 222 项 Host 模型与功能门控、38 项桌面更新器检查；补丁重建、类型、lint、网页导出及格式检查通过。
- [x] 2026-11-15 发布 `0.15.4-r4`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.4-r4) / [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.4-r4)。Windows x64、Android ARM64 来自同一源码 `7b785ede0ab2a461c395d4a6a9ad4c70e252a338`；[最终构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43685723542) 和[发布任务](https://github.com/TwiceDrop/paseo-latex/actions/runs/43689784757) 均成功，保留原应用身份和 Android 证书。
- 发布验证：[CNB 镜像](https://github.com/TwiceDrop/paseo-latex/actions/runs/43689837484) 校验四个附件上传后与公开下载的完整 SHA-256；实际客户端解析器确认 latest 为 `0.15.4-r4`、Android `versionCode=1500404`，Windows 清单为 `0.15.4-latex.4`，下载地址固定到本次标签。Windows 包内更新器通过首次请求、完整下载及损坏拒绝检查。没有实体 Android/Windows 交互性能或覆盖安装数据。
- [补丁归档](https://github.com/TwiceDrop/paseo-latex/actions/runs/43685723542/artifacts/14150339217) 保留 30 天；可随时从 Git 源码重新导出。归档内补丁 SHA-256 为 `3df641de91cd1a4a9da3e7e36e855f9cc25a4f906f8f579ce45d47ed26ca6907`，重放后的 Git tree 为 `a07871c395d23c1ff5db8170f11b89a2f3d049da`。

## LATEX-008：弱网时共享附件误报 Host 版本不支持

- 2026-11-15 用户先要求排查，随后明确要求修复并发布。手机使用最新版个人客户端，Windows 官方 Host `0.15.0`；动车弱网时出现“无法加载共享附件：请更新官方 Host，以启用附件共享。”，网络良好时不出现。重试按钮显示 `common.retry`。
- [x] 核对官方 `v0.15.0` 与 `v0.15.4`：均声明 `workspaceFileEditing=true`、`canonicalSubmittedPrompts=true`，不能仅凭该提示要求升级 Host。
- [x] 定位客户端误判：`shared-message-runtime.ts` 的 `getSharedMessageStore()` 把 `getLastServerInfoMessage() === null` 和确实缺少功能一起当作 Host 不支持；实际 `DaemonClient` 会在断线/重连时清空握手信息。
- [x] 定向时序模拟使用原有运行时函数、查询配置和 TanStack Query：渲染时能力有效，查询启动前模拟握手信息清空，即复现相同中文错误，文件读取次数为 0；查询禁用后错误仍保留，恢复握手并重新启用后成功。该证据是控制时序模拟，不是动车网络或 Android 真机复现。
- [x] 定位文案错误：附件组件两处调用不存在的 `common.retry`，正确键是 `common.actions.retry`。中英文资源均使用后者。
- [x] 修复：握手丢失返回连接错误，只有已握手且确实缺少能力时提示更新 Host；断线时显示重连状态并禁用重试。重连按 Host 使附件元数据和图片查询失效，查询启动时获取当前连接，瞬时连接错误最多重试两次；真实权限/元数据错误仍可见。修正重试按钮翻译，保留前台/活动面板门控与读取并发上限。
- [x] 定向回归覆盖握手丢失/恢复、真正能力缺失、错误分类与重试上限、按 Host 恢复且不读取非活动行；没有证据表明原提示代表 ZIP 损坏或附件数据丢失。
- [x] 浏览器端到端：第二设备无附件本地缓存，读取途中切断 WebSocket，显示重连和禁用的“重试”；重新握手后自动恢复图片/文件，重新加载会话及打开预览通过。没有点击重试或重启 Host。

## LATEX-009：Android 流式生成时上翻历史回弹

- 2026-11-15 用户反馈：回复仍在生成时，历史无法拉到最上方，会回弹到固定位置；**生成自然结束后，不退出会话即可正常上翻**。截图中“回到底部”按钮可见。
- [x] 代码排查：原生聊天使用倒置 `FlatList`，实时内容放在 `ListHeaderComponent`；Android 只在 `sticky-bottom` 时禁用 `maintainVisibleContentPosition`，脱离底部阅读历史时仍启用。React Native 的该辅助器会在布局变化后主动调用 `scrollToPreservingMomentum`，与 JS 底部控制器是两条滚动调整路径。
- [x] 核对这些滚动核心文件与官方 `v0.15.4` 一致。本次定向运行 `bottom-anchor-controller.test.ts`、`history-start-pagination.test.ts` 共 33 项通过，覆盖逻辑层的手动脱离、内容增长和分页；不能据此认定原生布局、手势和惯性时序无误。
- [x] 新增真实底部控制器与原生手势状态机的时序回归：松手后的 JS 帧先执行、惯性事件延后、随后流式内容增高，旧算法出现一次错误的回底部调用；修复后没有该调用。这是受控事件序列，不是 Android 真机 trace。
- [x] 0.15.4-r5 修复：Android 拖动至惯性结束持续保留用户滚动控制权（包括零速度松手）；上翻离开底部立即解除自动跟随。阅读时保留原生可见行位置补偿、移除自动回顶阈值；主动回底部会释放手势状态，继续生成时仍可跟随。
- 0.16.0 迁移：采用官方正向 LegendList、原生末端定位与展开定位；移除旧倒置列表的配置补丁。保留 Android 延迟惯性事件保护，适配新的严格末端判断；惯性开始不会覆盖拖动期间新发消息的主动跟随请求。受控时序回归继续保留，尚无真机结论。
- [ ] 真机复核：持续生成时慢拖/快速上划到最早消息、历史分页、回底部、生成结束与切后台恢复。当前环境无 Android 设备，不能把单元/浏览器结果当成实机验证。
- [x] 2026-11-15 将 LATEX-008/009 修复发布为 `0.15.4-r5`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.15.4-r5) / [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.15.4-r5)。Windows x64 与 Android ARM64 同源于 `e1c4fd4f1a201b7426c9970568ba2c07b2cdbe53`；[构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/43729207492)、[发布](https://github.com/TwiceDrop/paseo-latex/actions/runs/43733135373)及[CNB 镜像](https://github.com/TwiceDrop/paseo-latex/actions/runs/43733204514)均成功。
- 云端验证：492 项客户端单元、68 项浏览器、14 项导航/文档/Mermaid 场景、3 项跨设备/官方 Host 附件场景通过；另通过 222 项 Host、38 项桌面更新器和 38 项工作流检查，类型、lint、格式、正式网页导出及补丁重建通过。
- 发布验证：保留原 Android 签名和应用身份；镜像下载并校验四个文件的完整 SHA-256。实际客户端解析器确认 CNB latest 为 `0.15.4-r5`、Android `versionCode=1500405`，Windows 清单为 `0.15.4-latex.5`，下载地址绑定本次标签。Windows 包内更新器通过首次请求、完整下载及损坏拒绝检查；没有 Android 真机手势或覆盖安装验证。
- [补丁归档](https://github.com/TwiceDrop/paseo-latex/actions/runs/43729207492/artifacts/14168291335)的补丁 SHA-256 为 `a02513117d6f1d4c05451a509e8988a87e4da395f172d7faa1a745bacdf0abe5`，重建 tree 为 `4a8a481f0daba6b24b51ab7e3fbfbe01de391120`，无未归类文件。

## LATEX-010：同步官方 v0.16.0

- [x] 2026-11-17 同步官方 `v0.16.0`（`c54bc39e7997c03a07402c09df2e825889432557`），发布 `0.16.0-r1`：[GitHub](https://github.com/TwiceDrop/paseo-latex/releases/tag/latex-v0.16.0-r1) / [CNB](https://cnb.cool/twicedrop/paseo-latex/-/releases/tags/latex-v0.16.0-r1)。Windows x64 与 Android ARM64 同源于 `58af8c2a644e36b5964d4acf86bb8b889bf6ae39`。
- 两个官方版本位于不同发布分支；保留双方历史，以新官方树重新合并个人差异，更新可重放补丁基准。保留 LaTeX、按需 Mermaid、离线文档预览、下载、共享附件与重连恢复、侧边栏排序/折叠、独立身份及 CNB 更新器。
- 聊天列表采用官方正向 LegendList、原生末端定位及展开定位；Android 延迟惯性事件保护迁移到新接口，且不会覆盖拖动期间主动发送新消息的跟随意图。侧边栏折叠再展开保留官方“显示更多”状态。
- Windows 的新版 electron-builder 已包含旧 NSIS 修复，移除重复补丁；工具准备改用显式 ZIP 依赖和带 SHA-256 的新版缓存，实际下载、解压和缓存消费已检查。源码检查与两个安装包构建并行，发布仍校验三项全部成功及相同源码。
- 云端验证：[构建](https://github.com/TwiceDrop/paseo-latex/actions/runs/44013633704)通过 613 项客户端单元、73 项浏览器、15 项界面和 3 项跨设备/官方 Host 附件场景；另通过 236 项 Host、38 项桌面更新器和 40 项工作流检查。类型、lint、格式、正式网页导出和补丁重建均通过。
- [发布任务](https://github.com/TwiceDrop/paseo-latex/actions/runs/44016571115)复核 Android 原签名、包名和 `versionCode=1600001`；Windows 包内更新器通过实际下载及损坏文件拒绝检查。[CNB 镜像](https://github.com/TwiceDrop/paseo-latex/actions/runs/44016653094)复核四个附件上传后与公开下载的完整 SHA-256。实际客户端解析器确认 CNB latest 为 `0.16.0-r1`，Windows 清单为 `0.16.0-latex.1`，地址固定到本次标签。
- [补丁归档](https://github.com/TwiceDrop/paseo-latex/actions/runs/44013633704/artifacts/14298497772)的补丁 SHA-256 为 `de56454749570fcd0a0832da48fb9960c34365eebd62d50cb9cd00709a7ec267`，重建 tree 为 `4d28f713e1bf8abc2218e3494d5558d151a6d57f`，无未归类文件。当前没有实体 Android/Windows 的手势、覆盖安装或性能测量结论；Android 沿用 low-memory 构建选项。
