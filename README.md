# SCULPY Desktop Companion

SCULPY 奶油瓷偶的 Windows 3D 桌面精灵。首发目标为 Windows 10 / 11。

**开发中，当前版本 0.1.2；不是已验收的 V1.0。** 真正的透明桌面窗口、点击穿透、安装卸载、多显示器和长时间运行必须经过 Windows 实机验收。

## 开发

Node.js 22 LTS、Rust stable、Windows C++ Build Tools 及 WebView2。

```sh
npm ci
npm run check
npm run dev        # 3D 互动调试工作室；不是桌面程序
npm run tauri dev  # Windows 桌面程序
npm run tauri build # Windows NSIS 安装包
```

模型 `public/models/sculpy.glb` 包含真实网格、7 个骨骼、16 个动画片段，可用 `npm run model` 重建。它是基于原图制作的程序化开发模型，仍需外形验收和美术修整；不冒充经 Blender 人工精修的最终资产。

## 操作

- 单击打招呼；短时间连续点击会生气。
- 鼠标在头上往返移动可以抚摸，不需要按住鼠标。悬停不算抚摸。
- 按住角色拖动后松手，可以下落、弹跳和摔倒恢复。
- 右键角色打开设置；托盘可显示 / 隐藏、暂停、设置、重置和退出。
- 音效与开机启动默认关闭。模型不会与大语言模型聊天。

## 验证

```sh
npm run check
npx playwright install chromium
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml # Windows 开发环境
```

`npm run test:ui` 会启动并关闭本地调试服务器，输出实际 WebGL 操作测试和截图至 `test-results/`。浏览器检查不能证明 Windows 点击穿透、托盘或安装流程通过。

Windows 构建记录见 [docs/BUILD-STATUS.md](docs/BUILD-STATUS.md)。实机清单见 [docs/WINDOWS-ACCEPTANCE.md](docs/WINDOWS-ACCEPTANCE.md)。GitHub Actions 使用 Windows MSVC 编译并上传开发安装包构建产物，不自动发布 V1.0。

原图和三视图保存在 `assets/references/`，原始字节不修改。所有状态、开发记录和验收限制见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

直接使用 Cargo 交叉编译时，必须传入 `--features custom-protocol`；缺失时 release 构建会主动失败。0.1.0 的安装包存在启动依赖开发服务器的问题，请使用 0.1.1 或更新版本。

0.1.2 将设置窗口创建改为异步以处理 Windows 右键白屏卡死风险。托盘新增“重新加载角色”；修复效果仍需要 Windows 实机复核。
