# 余度的版本更新与发布

## 用户流程

「设置 → 版本更新 → 检查新版本」，看到正式版说明后下载。iPhone 版显示实际下载字节，核对大小、IPA 文件头和 GitHub 资产的 SHA-256；通过后可选择「导入 LCSign」。系统分享不会强行指定接收应用，在面板中选择 LCSign 即可；未显示时先存储到文件，再在 LCSign 导入。保留 `.ipa` 后缀，不以 ZIP 类型改名。

签名和安装由用户在 LCSign 中完成。请沿用已安装应用的签名身份、Bundle ID、App Group，并同时签署小组件。打开分享面板不等于已导入或已安装。首次使用本更新渠道，需手动安装包含更新入口的 0.2.0 版。

自动检查默认关闭；开启后，在启动和回到前台时最多每六小时请求一次，失败也计入间隔。手动检查不受间隔限制。自动检查不下载、不安装；关闭后不显示总览提示。

下载需保持应用在前台；不承诺跨进程续传。取消、校验失败和未完成文件会清理；成功下载缓存在系统缓存目录，重启可重新校验复用，系统也可能回收。分享取消或安装失败可再次导入。目标版本或更高版本启动后清理旧包。缓存恢复与分享前均重新校验。当前支持 128 MiB 以内的更新包。

网页只预览界面并打开 GitHub 下载，不模拟 iOS 文件校验和签名工具调用。

## 公开发行渠道

源码仓库 `Suxifang/QuotaDeck` 保持私有。公开仓库 `Suxifang/Yudu-Releases` 仅保存安装说明、IPA 和版本说明。应用只访问固定公开仓库的 `releases/latest`，不嵌入 GitHub 令牌，不上传站点凭据或配置。

只接受 `vX.Y.Z` 正式标签与唯一的 `Yudu-X.Y.Z.ipa`：拒绝草稿、预发布、外部下载地址、版本不一致、缺少 SHA-256 的资产。版本按数值比较，拒绝降级。GitHub 下载可能经过官方重定向，最终文件必须匹配正式资产的大小和 SHA-256。

## 维护者发布

1. 同时增加 `mobile/app.json`、`mobile/package.json`、`mobile/package-lock.json` 的版本，并增加 `ios.buildNumber`。为该版本编写 `docs/releases/vX.Y.Z.md`。
2. 运行项目检查、小组件检查和网页构建，提交并同步源码仓库，等待 main 的 macOS 构建成功。
3. 在项目根目录执行 `python tools/github-sync.py download RUN_ID`，下载记录会绑定构建 ID、提交和 SHA-256。
4. 执行 `python tools/github-sync.py publish-release RUN_ID`。工具从该构建对应的提交读取版本与公开说明，检查 IPA 的主程序、扩展、版本和名称，先上传到草稿，核对 GitHub 返回的摘要后再发布。

同一版本已公开但内容不同会停止，需增加版本号，不覆盖既有资产。公开发布使用本机已有的 Git 凭据，仅在进程内读取；不将令牌写入应用、仓库或日志。没有把本机令牌作为 GitHub Actions secret 上传；后续发布可继续通过上述本机命令完成。

## 借鉴来源

- Regram 的 `docs/app-updates.md`：版本和资产校验、前台检查节流、缓存复用与“交付不等于安装成功”的边界。
- LCSign 官方系统分享与文件导入功能。
- Expo SDK 58 官方 FileSystem、Crypto 和 Sharing API；GitHub Releases 官方 API。

本次实现是独立编写的便捷更新器，没有复制 Regram 的签名器或处理证书。iPhone 上 LCSign 是否出现在分享面板、实际签名与覆盖安装结果仍需实机验证。
