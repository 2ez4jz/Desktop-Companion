# Windows 开发安装包构建记录

当前版本：0.1.2，2026-11-04。

- 安装包：`SCULPY-Companion-0.1.2-Windows-x64-setup.exe`，2,812,722 字节，约 2.68 MiB。
- SHA-256：`f29525add3e9fd182cc06deb53df7aafddb14d0f3a84be7c73bf32af165dddb5`。
- release 编译与 NSIS 完整性检查通过；生产协议启用，前端与 GLB 内置。
- 设置窗口改为异步创建；托盘入口也异步。该修改处理 Windows 同步创建 WebView 的已知死锁风险。
- 15 项逻辑 / 轮廓测试、3 项 Rust 点击映射测试、10 项浏览器操作测试通过；前端设置面板连续开关 20 次未出错。
- 无开发服务器的生产页面测试通过。上述浏览器测试不等同于 Windows 原生窗口验收。
- 未签名；用户反馈的右键白屏修复，以及多屏 / 点击穿透仍需 Windows 实机复核。

## 历史版本构建记录

### 0.1.1 记录

历史版本：0.1.1，2026-11-04。

## 0.1.0 已撤回

用户实机确认安装后连接 127.0.0.1 失败。原因是交叉编译漏开 custom-protocol，实际上未嵌入前端。此前记录中“0.1.0 前端已嵌入”的结论不成立；旧包停止使用。

## 0.1.1 修复包

文件：`SCULPY-Companion-0.1.1-Windows-x64-setup.exe`，2,707,754 字节，约 2.58 MiB。

SHA-256：`d6aef4a561b31fa7beaa16b65eba9a7e85b45c9fa82b1d6784e7574f2bd34816`

- 使用 `cargo build --release --target x86_64-pc-windows-gnu --features custom-protocol` 编译。
- 确认编译后的 Windows 可执行文件含 index.html、models/sculpy.glb 资源键。
- 缺失生产 feature 的 release 构建会主动失败，保护检查已执行。
- 未运行 Vite 的生产 dist 浏览器测试通过，模型加载、睡眠与唤醒正常。
- NSIS 生成成功，7-Zip 安装包完整性检查通过。
- 包含主程序、WebView2Loader.dll、卸载程序，英文及简体中文安装界面。
- 未签名，Windows 实机启动、透明窗口及点击穿透仍待验证。

打包时临时移除清单的 tray feature，仅用于绕过 Tauri CLI 在 Linux 主机误检测 appindicator 的问题；已逐字节恢复。Windows 程序仍带托盘功能。正式 MSVC 构建使用仓库 Windows CI，无需此处理。

历史状态：本次用户授权上传之前，仅完成本地构建，未成功推送公开仓库或运行远程 CI。2026-11-04 用户已明确要求上传，后续状态以 GitHub 提交和 Actions 为准。
