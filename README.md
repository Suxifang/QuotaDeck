# 余度 · Yudu

在 iPhone 上集中查看 Sub2API 套餐、反代上游账号与其他 API 额度。使用 Expo / React Native 开发，Windows 可开发和预览，通过 GitHub macOS 构建未签名 IPA，自行签名安装。

本项目采用 MIT 许可证开源。源码与正式版本统一在 `Suxifang/Yudu` 维护；下载 IPA 请前往本仓库的 [Releases](https://github.com/Suxifang/Yudu/releases/latest)。安装方法见 [安装与更新](docs/RELEASE_README.md)。

## 已实现

- 通透磨砂的总览、连接与设置；支持浅色、深色、系统外观。天青与鼠尾草色的柔和背景、清晰的额度数字；浮动底栏使用连续滑动的玻璃透镜，带按压和轻微回弹。iOS 26 使用原生 Liquid Glass，较旧系统使用模糊效果，并遵循降低透明度与减弱动态效果设置。
- Sub2API 套餐每日／每周／每月额度、实际今日消耗；Sub2API 反代 Codex 五小时／七天额度，管理密钥或管理员登录，支持批量选账号和按 ID 添加。
- New API、One API、OpenRouter、DeepSeek，以及可配置字段路径的自定义 GET 余额接口。
- 单账号独立刷新、前台自动刷新、置顶、重连、暂停、删除；最近成功结果与本机每日余量记录，最多保留 90 天。
- 点击总览大卡片进入详情；“额度概览、余量记录、连接管理”三个页签。余量记录含七日趋势及每日快照表，不将额度变化当成逐笔扣费。
- 区分后台采样与手机查询时间。采样过旧、缺少采样时间或已过重置时间时明确提示，不虚构重置后的额度。
- iOS 凭据存入系统钥匙串，后台密码不落盘；导出配置不含凭据。网页预览凭据只保留在当前页面内存中。
- 明确标识、独立于真实账号的演示模式。
- 设置顶部的「软件更新」与主页右上角更新入口读取本仓库 Releases 的正式版；支持更新说明、下载进度、取消、大小与 SHA-256 校验，以及系统分享导入 LCSign。可选每六小时的前台自动检查，默认关闭。
- 总览、连接与设置支持原生左右滑动，点按底栏平滑过渡，透镜跟随手势，各页保留浏览位置。iPhone 开放 ProMotion 高刷新率支持，兼容设备最高 120Hz，由系统结合电量和温度调度。
- iOS 小号桌面卡片、中号多账号卡片及矩形锁屏小组件；置顶优先，可选关注账号，点击进入对应详情。应用查询后同步，15 分钟后或已过重置时间标记待更新。应用关闭后暂不主动抓取额度。

## 本机预览

```powershell
cd mobile
npm ci
npm run web
```

首次启动可选择“先看演示”，或填写实际站点与密钥。网页可能受目标站点 CORS 限制；iOS 版本直接查询站点。应用不提供额外代理服务器。

## iOS 安装包

普通用户可从本仓库的 Releases 下载 `Yudu-版本号.ipa` 与 `SHA256SUMS.txt`，使用自己的签名方式安装。

开发者推送 `main` 或手动运行 **Check and build iOS** 工作流。检查通过后，macOS 会生成原生项目、编译 Release，并将 `Yudu-unsigned.ipa` 上传至 **Yudu-unsigned-IPA** 构建附件。构建附件用于验证；正式发布使用 [发布流程](docs/UPDATES.md)，标签绑定产生该 IPA 的源码提交。

构建不需要 Apple 开发者账号、Expo 账号或签名证书。未签名 IPA 无法直接安装，需自行签名。最低系统版本由 Expo 58 原生依赖约束（当前为 iOS 16.4）；原生玻璃效果需要 iOS 26。

小组件随 IPA 一起提供，包含独立扩展及共享 App Group。连接真实账号后，在「设置 → 桌面与锁屏小组件」点“立即同步”，可看到共享空间写入结果；演示数据不会同步。自签时需同时签署主应用与扩展，并保留相同的 App Group 权限（`group.app.quotadeck.mobile`）；仅给主应用签名或移除该权限会使小组件无法共享数据。iOS 17 起可长按每个小组件单独选账号；较低版本可在应用设置内选择。真实 iPhone 的小组件显示与签名兼容性仍需安装后确认。

## 检查

```powershell
cd mobile
npm run check
npm run check:widgets
npm run build:web
```

`tools/mock-api.py` 提供仅监听本机的测试接口，供浏览器完整接入流程验证；测试密钥均为假数据。Windows 可检查 iOS JS 资源打包；原生编译以 GitHub macOS 实际运行结果为准，手机效果仍需实机确认。

## 接入说明

见 [接口与数据说明](docs/PROVIDERS.md) 和 [参考项目及实际复用](docs/REFERENCE_REVIEW.md)。修改并复用了三个 MIT 项目的实际模块；来源、固定版本和完整许可保存在 `THIRD_PARTY_NOTICES.md`、`licenses/`，以及应用内的开源致谢。

所有源码、依赖、本机参考克隆、缓存及生成附件均放在本项目文件夹内；缓存、凭据与构建产物不提交到 GitHub。

本地生成产物不进入 Git 源码树；正式 IPA 仅作为本仓库 Releases 的附件提供。项目只维护这一个公开仓库。

已安装 0.2.0 或 0.2.1 的用户，请手动从本仓库 Releases 下载并覆盖安装 0.2.2 或更新版本一次，以启用最终的应用内更新地址。

## 品牌与发行

已采用「余度 · 留白刻度」，原稿为 `design/brand/yudu.svg`。运行 `python tools/generate-assets.py` 从矢量稿生成正式应用图标。应用显示名与小组件已更新；原 Bundle ID、URL scheme、App Group 保持连续。

`design/brand-comparison.html` 保留三组候选的设计记录。更新与发布流程见 [更新说明](docs/UPDATES.md)。
