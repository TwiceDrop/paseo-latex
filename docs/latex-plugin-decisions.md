# 插件择优与补丁边界

评审日期：2026-11-15（北京时间）。基于官方 `v0.15.4`，不是对插件目录全部 536 项的兼容性认证。比较范围是本客户端已有功能及直接替代候选；目录介绍、源码实现、作者验证记录与我们的实测分别判断。优先保持 Windows、Android、官方 Host/CLI 和中继连接可用。

## 同一 Host 混用官方版和 LaTeX 版

在 LaTeX 版的「设置 → 插件 → 已安装」中打开插件详情，开启「仅在本机屏蔽」。例如，在手机上屏蔽 Math Renderer Plus 后，该手机使用内置公式渲染，连接同一 Host 的官方客户端仍可使用插件。屏蔽按设备、Host 和插件分别保存，重启后继续生效。关闭本机屏蔽即可恢复 Host 已启用的插件。

已安装列表里的绿色开关控制 Host。插件在 Host 上执行的钩子、任务或写入会话的内容，仍由 Host 设置决定。

## 逐项选择

| 能力                     | 比较结果                                                                                                                                                                                                                                                                                      | 当前选择及迁移边界                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LaTeX                    | [RaTeX Math Render](https://github.com/ZedRover/ratex-paseo/tree/04109ce5a99acb3ee0a6fb3781cdfc620f90b116) 的原始源码检查、复制和双向消息渲染更丰富；其公式走 Host WASM → DisplayList → Web Canvas，原生端回退源码。我们 Android 已用同版本 RaTeX 0.1.14 原生渲染，Web 用 KaTeX/MathML。      | 保留 Enriched Markdown 与现有源码适配；删除已不被应用调用的旧 KaTeX WebView 实现和生成步骤。无需额外 Host RPC，不替换整条消息。原始分隔符精确复制、用户消息数学渲染仍是后续 UX 候选，不假称已具备。 |
| 增强 Markdown            | [Advanced Markdown 0.4.1](https://github.com/custyhs/paseo-advanced-markdown/tree/39a01bb091715230a56837d08b497c59f311d3ec) 的公式缩放/源码交互较好，Host MathJax/resvg 生成图像；原生设备验证尚不足。GeoQiao Math Renderer 仍有实验性与消息替换边界。                                        | 沿用官方消息、代码、文件链接、选区和流式路径，避免同时启用多个接管整条消息的转换器。借鉴交互不等于接入第二套渲染后端。                                                                              |
| Mermaid                  | 官方已有流式队列、错误前缀恢复、主题和全屏视图；不需要插件重写。现有大 HTML 字符串进入启动 JS/Hermes。                                                                                                                                                                                        | 保留官方实现；将运行时改成安装包内按需读取的 HTML 资产，共用加载结果，最后一个视图关闭后释放缓存；保留封闭 CSP。                                                                                    |
| PDF                      | [PDF and Office Viewer 0.7.0](https://github.com/nkwib/paseo-doc-viewer/tree/0f39c81883aef30711e0c5bce4fb2d41a544de0d) 支持搜索、书签、批注，Host 渲染按页传输。PDF.js Viewer 的桌面选区/搜索也强。前者作者有真实 Web/Host 测试，但没有实体 Android、远程 Host 或中继实测；后者没有原生支持。 | 高级阅读优先评估 nkwib 插件，通过官方“打开方式”按 PDF 格式记忆。未安装插件的官方 Host 仍用本地 PDF.js 预览；不把插件描述当作手机端实测，不擅自在现用 Host 安装。                                    |
| Word/PPT                 | nkwib 的 Word 是阅读视图，PPT 是文本/图片阅读，不能等同页面/幻灯片原版式。[Office Preview](https://github.com/apple-ouyang/paseo-office-preview/tree/ce667e7e8931c40d9117f33ab2468128968d834a) 也用浏览器文档引擎，但只覆盖 Web/桌面。                                                        | 保留本地 docx-preview、PPTX 版式预览与原生 WebView 壳；仍可按格式选择插件。不能为了减少补丁直接丢掉手机端或 PPT 版式。                                                                              |
| 表格/文本                | nkwib 在 Parquet、JSONL、单元格检查等方面更丰富；本地实现已有旧 XLS、分页与编码适配。                                                                                                                                                                                                         | 常见 XLSX/XLS/CSV 和文本保留按需加载与分页；额外格式交给已安装插件，避免继续扩展自有通用文档平台。                                                                                                  |
| 下载                     | File downloads 插件需要额外 HTTP 端口/网络可达性，不能直接替代当前连接上的下载。FileActions 的本地打开也不等于远端下载。                                                                                                                                                                      | 保留已认证连接的二进制帧下载，以及 Android 系统“另存为”。原生模块和客户端传输扩展是独立补丁边界。                                                                                                   |
| 跨设备附件               | Paseo Essentials、Inline Image Preview 可以展示历史中已有的图片/工具引用，不能恢复官方 Host 历史未保存的用户附件载荷；PaseoSync/Host Backup 同步范围也不同。                                                                                                                                  | 保留发送前持久化及按 Host 隔离的附件索引，只依赖官方文件 API。不能用图片画廊替代附件存储。                                                                                                          |
| 侧边栏                   | Sidebar Organizer 侧重标签/置顶，Clusters 的桌面 DOM 分组拖动不能修复原生会话排序。                                                                                                                                                                                                           | 保留最小排序/手势修补，继续沿用官方侧边栏和存储。                                                                                                                                                   |
| CNB 更新、独立安装与签名 | 上述候选没有提供本客户端所需的分发和安装身份替代。                                                                                                                                                                                                                                            | 保留 CNB 更新、安全校验与发布工具；与内容渲染分开维护。                                                                                                                                             |

插件入口以 [Paseo 插件目录](https://paseo.sh/plugins) 为发现来源，审阅时注册表提交为 `a0877615ce03c70368fd24aa0740128f31e488c3`。候选依赖会变化，升级时重查固定版本；不要只比较 README 功能清单。

## 为什么不直接全部改成 Host 插件

用户使用官方 Host/CLI，插件需要在相应 Host 安装并启用；原生支持、版式、网络路径也不能按“支持 Paseo”一概推断。现有官方文件面板协议已经允许本地预览与插件共存，并记忆每个扩展名的选择。补丁只保留必需的本地能力，不新增选择器，也不强制插件或覆盖已有选择。

## 后续更新的操作入口

补丁目录在 `scripts/latex/patch-catalog.json`：每项记录接口约束与路径，公共配置可同时属于多个功能。`latex:patches export` 输出完整二进制 Git 补丁、固定基准/源码 SHA、SHA-256 与功能索引；`check` 在临时 Git 索引里三方重放，报告与新上游重叠的文件、冲突和受影响功能，不改当前分支/索引/工作区。基准重放必须得到与源提交完全相同的 Git tree。

这是可重放的完整补丁包，**不是可随意拆装的独立插件集合**：依赖、语言资源、文件面板入口等共享文件仍需联合审阅；三方重放无冲突也不能代替语义回归。

```sh
# 导出已提交版本；目标目录必须尚不存在。
npm run latex:patches -- export --out /tmp/paseo-personal-patches
# 验证记录的基准可以精确复原。
npm run latex:patches -- check --bundle /tmp/paseo-personal-patches --ref v0.17.2
# 先 fetch 一个明确的新官方 tag，再只读预检。
npm run latex:update -- --ref v0.17.2 --dry-run
```

确认目标版本后才运行非 dry-run 更新。更新成功会刷新补丁目录中的官方基准；提交该目录和生成资源，再导出新补丁包。源仓库须保留基准对象（新克隆先 fetch 官方 tag），补丁包不含密钥、用户数据或未提交文件。需要在其他检出应用时，先创建干净的审阅分支，再 `git apply --3way --index /path/to/personal.patch`，检查/提交后运行下述验证。

迁移和 CI 共用 `npm run latex:verify -- --suite unit`、`browser`、`e2e` 的定向用例清单；官方 Host 附件、桌面更新器与原生打包仍由发布工作流额外检查。共享依赖升级后先运行 `latex:prepare`，再 typecheck、lint、浏览器/隔离 Host 回归和 Windows/Android 构建。主 Host 不参与测试、不重启。

## 性能证据范围

本轮比较同一 Node、Metro、APP_VARIANT 和生产导出参数下的 Web 入口与 Android Hermes 字节码，以及对应资源打包情况。生成资产移动到单独文件意味着首次查看仍需读取并初始化该引擎，不意味着安装包等量缩小。浏览器回归和字节数不代表实体 Android 启动耗时、FPS 或内存改善；这些仍须同机同会话测量。

基准源码 `0a1c1fc4349ad4a008ebb9bca280f00a07a4cd63`；优化后为本记录所在实现。Node 22.23.4，保持锁定依赖，不升级渲染引擎。两次均在 `packages/app` 执行：

```sh
APP_VARIANT=latex CI=1 EXPO_NO_TELEMETRY=1 PASEO_LOW_MEMORY_BUILD=1 npm exec -- expo export --platform web --platform android --output-dir <独立输出目录>
```

| 产物（未压缩字节数）  |           修改前 |     修改后 |                减少 |
| --------------------- | ---------------: | ---------: | ------------------: |
| Web 主入口 JS         |       24,061,325 | 20,484,677 | 3,576,648（14.86%） |
| Android Hermes 字节码 |       31,600,445 | 24,672,245 | 6,928,200（21.92%） |
| 按需 Mermaid HTML     | 包含在上述代码内 |  3,456,634 |      单独随应用打包 |

已逐字节核对 Android 导出清单中的 HTML 资产，SHA-256 为 `3c9d794cc11df1b096083f93599b1c0f02e8655e7447b9238db475f26d559e3f`。没有把运行时转移到 CDN。Web 新入口 SHA-256 为 `b63255a289e736f25f4a52aa7997b0d1bc661bb26d507254f08cbd67b0eea667`，Hermes 为 `8adb87f4efb6011f0ede77a0c6bcc67db95c70727614df13d87940acb6a2d451`。

本地验证：438 项定向单元测试、68 项真实 Chromium 用例、6 项隔离 Host 端到端场景及 38 项工作流/发布/补丁工具检查通过；各工作区 typecheck、lint、统一资源构建通过。端到端实测涵盖启动时不读 Mermaid、首次图表读取、全屏复用、资源失败后保留源码并手动重试，以及流式完成/刷新恢复和文档查看。没有实体 Android/Windows 交互性能数据。

CI 每次还会导出并精确重放补丁包，产物名 `paseo-latex-patches-<源码 SHA>`，保留 30 天。长期使用时下载归档；Git 源码和基准提交仍是可重新导出的永久来源。
