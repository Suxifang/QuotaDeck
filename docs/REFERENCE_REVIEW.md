# 参考项目与实际复用

检索及检查日期：2026-11-02。原始浅克隆保存在本项目 `.references/`，不随应用发布。

| 项目 | 已检查内容 | 处理 |
| --- | --- | --- |
| ckken/sub2api-mobile | Expo、管理密钥、账号分页、SecureStore、请求 URL 去重 | MIT；实际移植请求 URL 模块，并沿用后台接入方式 |
| CrossStar/sub2api-dashboard | Codex 配额、时间锚点、白名单账号清洗 | MIT；实际移植 quota-mapper、account-normalizer、类型和错误模块 |
| MuAllen/dsh-gateway-wallet | 无密钥站点识别、Sub2API 和 New API 账本 | MIT；实际复用 fingerprint 模块，添加路径和响应校验 |
| nextroad-dev/AIUsage | 手机额度 UI、余额适配器、未签名 IPA 工作流 | 未发现明确 LICENSE；参考功能和公开接口，不复制实现 |
| RebornQ/fl_api_hub | Flutter 站点适配器、平台状态、IPA | AGPL-3.0；阅读比较，未引入 Dart 代码；其 iOS 标注未测试 |
| Regard1ess/sub2api-ios | SwiftUI 管理端、Keychain | 未见明确 LICENSE；阅读比较，未复制 |
| blueskycrb/sub2api-ios | SwiftUI 用户端、2FA、GitHub iOS 构建 | 未见标准许可证；阅读比较，未复制 |
| mcxiaochenn/AiUsage | Flutter 本地监控、多币种、演示和缓存 | MIT；阅读比较，未复制 |
| bejix/upstream-ops | 多站管理功能范围 | 未见明确 LICENSE；未复制 |
| expo/expo · expo-widgets、@expo/ui | SDK 58 官方小组件、SwiftUI 组件、独立运行时与配置插件 | 直接依赖 MIT 软件包 58.0.26，使用官方扩展生成与时间线机制 |

实际复用版本：

- sub2api-mobile: `3177500f74b005ed32512d3f79a7a24d05eac352`
- dsh-gateway-wallet: `c239009846d356bde8dbfa1f4b2bcf651d9c7439`
- sub2api-dashboard: `b8824f0f9427d3085a6fd96bb7f612e5869d8a7c`

逐次使用记录另核对了官方接口源码：Wei-Shaw/sub2api `4a4a83ee5ec86b19d3a2dd9b6471de5128963bec` 的管理记录 handler、账号过滤、分页、用户 JWT 路由及 UsageLog 字段；QuantumNous/new-api `c046559bbd8b154e88e69905f60e71a5f4f1e5aa` 的 `/api/log/token` 路由、TokenAuthReadOnly、近期条数限制、消费/失败类型及费用、缓存和延迟字段。仅依据公开协议独立编写适配器，未移植两者的实现代码。

改进：统一数据记录、单个账号独立刷新、查询时间与采样时间分开、超时和错误分类、站点内请求约束、先检查公共响应再发送凭据、原生液态玻璃与无障碍回退、手机安全存储。没有复制上游响应中的 credentials 或任意 extra 数据到缓存。

小组件通过官方 config plugin 生成独立 iOS 扩展，不手动维护生成的 Xcode 工程。小号与锁屏支持单独选择账号，中号显示最多三个账号。只向共享空间投影显示名称、数值、采样状态和应用内跳转，不共享原始响应、站点地址或凭据。未来时间线仅使旧额度进入待更新状态，不预测重置后余额。应用关闭后暂不主动抓取；桌面外观及 App Group 自签兼容性须由真实 iPhone 确认。
