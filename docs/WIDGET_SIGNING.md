# 小组件自签兼容测试

若安装后主应用无法访问 App Group，而签名与描述文件允许的是其他共享组，可先制作本机专用兼容包，验证两端统一使用获授权组后的结果。

兼容包沿用成功发布的 IPA，只修改主应用与小组件的 `ExpoWidgetsAppGroupIdentifier`，再以无证书的 ad-hoc 签名嵌入同一组。应用版本、Bundle ID、URL scheme、账号存储键及 JavaScript 保持原样。已有组件的缓存可能需要移除再添加。

这类包只用于对应签名环境的真机测试，不能覆盖正式 Release 的附件，不能向所有用户宣称支持同一组。正式构建、发布校验仍默认要求原来的 `group.app.quotadeck.mobile`。

## 制作

需要 Python、OpenSSL，以及经官方 SHA-256 校验的 apple-codesign 0.29.0 `rcodesign`。工具和工作文件均放在项目的 `.cache/`，输出放在 `artifacts/`。

```powershell
python tools/widget_compat.py `
  --source artifacts/Yudu-0.2.3.ipa `
  --signed-reference artifacts/reference-signed.ipa `
  --group group.your.authorized.group `
  --codesign .cache/path-to-rcodesign/rcodesign.exe `
  --openssl path-to-openssl.exe `
  --output artifacts/widget-compat/Yudu-0.2.3-widget-compat-unsigned.ipa
```

所选共享组必须同时出现在参考包的主应用签名、小组件签名及其现有描述文件中。参考包的描述文件、证书、设备列表和个人账号标识不会复制到输出。检查 CMS 内容签名时不验证开发者证书链；此检查不能替代设备安装验证。

## 安装与核对

1. 用原来的证书和描述文件，在 LCSign 中重新签署兼容 IPA，并保留小组件扩展。
2. 覆盖安装后打开余度，查询真实账号，再点“立即同步到小组件”。
3. 若同步成功但桌面仍是旧数据，移除旧组件并重新添加。
4. 若仍显示共享空间不可用，检查这份兼容包最终重签后的两边 Info.plist、签名权限和描述文件；不要用其他版本的签名包替代。

## 共享空间可用后仍报同步错误

`Exception in HostFunction: <unknown>` 只表示原生调用抛错，不能据此再次认定为签名问题。0.2.3 的显示数据会将未知百分比写成 `null`，而 Expo 58 的 `WidgetsStorage` 直接使用 `UserDefaults` 属性列表存储，不能保存该值。0.2.4 改为省略未知字段，保留真实 0%，并在账号选项、两种小组件写入及回读失败时分别标出步骤、保留原始错误。

macOS 构建会运行 `tools/check-widget-storage.ts`：使用当前应用投影生成余额、不限额和零余量样本，验证 Foundation 拒绝旧空值结构，再通过已安装 Expo 的真实 `WidgetsStorage.swift` 写入、回读新结构和空账号。该检查使用临时普通偏好套件，不代表验证了真机 App Group 权限或扩展显示。

输出旁的 JSON 保存来源 SHA-256、选定共享组、包内验证和“仍需重签”的状态。真机共享空间、扩展实际安装授权与组件显示，均需最终重签安装后确认。

包内验证会逐页检查 SHA-256 代码哈希，以及 Info.plist、权限声明、资源封包和嵌套签名的哈希。当前仅支持本项目实际产生的薄 64 位 Mach-O 格式。`rcodesign 0.29.0 verify` 会把无证书 ad-hoc 签名的空 CMS 封包报为错误，因此不把该命令作为通过依据；这些哈希检查也不代表通过 Apple 证书信任链或设备安装验证。
