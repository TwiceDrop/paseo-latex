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
- [ ] 后续候选：初始依赖图仍含约 3.58 MB 的 Mermaid 生成模块，可另行验证按需本地加载；本次保持 Mermaid 行为不变。保留工作区与流式消息性能需先取得实际设备基线。

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
- [ ] 用户在 Windows 手动覆盖安装 `0.15.3-r3` 后，实测通过 CNB 更新到 `0.15.4-r2`。已安装的错误更新器不能靠服务端替换清单修复；Android 不受该初始化问题影响。

## LATEX-006：兼容官方 Host 的跨设备聊天附件

- 反馈与实施日期：2026-11-13。
- 用户反馈：同一个 Host、同一个 Codex 会话，本机发出的图片和其他附件在另一台设备上只剩文字。Host 使用官方桌面客户端及 CLI，要求保留官方 Host。
- 代码排查：用户消息协议和 Codex 历史适配只输出文字与消息 ID，原发送端依赖本地附件缓存；这能解释现象，不代表 Codex 未收到图片。
- [x] 只修改个人客户端，复用官方文件接口保存附件和消息索引；覆盖普通发送、新建会话首条消息及队列发送。
- [x] 第二台客户端按消息 ID 恢复缩略图、文件预览入口；重连和历史重新加载后仍可读取。
- [x] 原发送端打开旧消息时补存仍可读取的附件；缓存已丢失的旧附件不承诺恢复。
- 验证：附件、发送及翻译定向单测共 95 项通过；普通会话与新建会话的独立浏览器验证通过，覆盖第二端无本地消息/图片缓存、放大图片、刷新和文件预览入口。未修改的官方 npm Host `0.15.4` 已验证双客户端读取及重启恢复；全仓库 lint、App 类型检查通过。
- 构建与发布：计划 `0.15.4-r3`，沿用原 Windows / Android 应用身份与签名；以对应 Actions 结果和 Release 为准。未进行 Windows、Android 真机操作验证。
- 存储位置、兼容边界及保留策略见 [共享聊天附件](latex-client.md#shared-chat-attachments-with-official-hosts)。
