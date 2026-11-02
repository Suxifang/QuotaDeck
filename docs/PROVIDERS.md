# 接口与数据

| 接入方式 | 读取接口 | 所需凭据 | 显示范围 |
| --- | --- | --- | --- |
| Sub2API 套餐 | `GET /v1/usage` | API Key，Bearer | 套餐窗口、密钥或账户余额；今日 actual_cost |
| Sub2API 反代 | `GET /api/v1/admin/accounts` 及 `/{id}` | 管理密钥 x-api-key 或管理员登录 | 后台已保存的 Codex 5h/7d 采样、本地账号限额 |
| New API | `GET /api/status` + `/api/usage/token/` | API Key，Bearer | 密钥额度，按站点公开换算规则显示单位 |
| One API | `GET /v1/dashboard/billing/subscription` + `/usage`，兼容无 v1 前缀 | API Key，Bearer | 密钥账单额度 |
| OpenRouter | `GET /api/v1/credits` | 具备 credits 查询权限的 API Key | 账户 credits；不把 key spending limit 当作账户余额 |
| DeepSeek | `GET /user/balance` | API Key，Bearer | 各币种余额分别显示 |
| 自定义 | 站点内 GET 路径 | Bearer 或 x-api-key | 显式指定剩余、已用、总额、采样及重置字段 |

## 口径

- 金额、百分比、不同币种不相加。缺失值显示 `—`，不显示为零。
- Sub2API `weekly_limit_usd = 0` 等零限额窗口按不限额处理，需有对应 usage 字段。
- 每日、每周窗口可由后台 window_start 推导重置时间，并标记“预计”；不推测自然月长度。
- Codex 相对 reset_after_seconds 以 codex_usage_updated_at 为锚点。过期 reset 仍保留，用于等待重置确认；不会把旧数据改成 100%。
- 反代页仅读取后台缓存，不主动执行额度探测；未知采样时间或超过 15 分钟会提示。
- One API total_usage 单位为美分；New API 从站点的 quota_per_unit 与货币配置换算，不使用全站通用固定值。
- 今日消耗取 actual_cost，与套餐累计消耗分别显示。每日余量折线不冒充每日消费量。

## 连接

自动识别只请求公共端点，不带凭据；识别不清时手动选类型。Sub2API 管理端无法通过普通 API Key 读取；若未开放列表，可填写单个账号 ID。开启二次验证的后台请使用管理密钥，当前未实现登录验证码输入。

站点需使用有效 HTTPS；允许局域网地址使用 HTTP，但 iOS 系统网络策略可能进一步限制数字 IP 的明文连接。自定义路径限制为同站点内，不支持运行脚本。自定义字段采用 `data.balance` 这样的点路径，换算倍率乘在返回值上。

登录状态按站点共用，多个上游账号并发失效时合并刷新；删除最后一个监控后移除凭据。普通配置只存显式清洗后的额度字段，不落盘上游 credentials 或任意 extra。

## 逐次使用记录

- Sub2API 反代：`GET /api/v1/admin/usage?account_id=ID&page=N&page_size=20&sort_by=created_at&sort_order=desc`，沿用管理密钥或管理员会话。逐行校验返回的 `account_id`；任何一条账号不符或缺失都拒绝显示，不回退到全站记录。按后台分页，未把列表的局部费用合计为今日总额。
- New API：`GET /api/log/token`，API Key 只在 Bearer 请求头中发送，绝不放进 URL。接口返回当前密钥的有限近期记录，本地每页显示 20 条，不假装支持完整历史分页。只展示消费和失败请求，排除充值、退款、管理等事件。老分支或站点若不支持 Bearer 查询则报告不兼容。
- Sub2API 套餐：详情内用站点邮箱和密码登录，支持 TOTP 两步验证码。通过 `GET /api/v1/keys?page=N&page_size=100` 在手机内匹配完整 API Key（最多检查 1000 条），再用用户 JWT 请求 `GET /api/v1/usage?api_key_id=ID&page=N&page_size=20&sort_by=created_at&sort_order=desc`。逐行验证 `user_id` 与 `api_key_id`，不回退到账号全部记录。密钥不进入查询参数；密码不落盘，用户 JWT 单独存入钥匙串，原额度 Key 不变。站点隐藏完整密钥、没有兼容用户接口或只允许第三方登录时明确提示。其他接入方式尚未接入逐次日志。
- 验证登录：从公共设置检查 Turnstile、腾讯／阿里验证码及登录协议要求，需要时在原生应用内打开本站登录页；原密码表单也提供该入口。独立临时网页会话完成站点验证后，只读取 Sub2API 官方前端的 `auth_token`、`refresh_token`、`token_expires_at`，不读取密码或网页身份。主页面和交接消息限于配置站点的确切来源及路径前缀，第三方验证子框架不获得交接权限；关闭时释放临时网页。应用先用 `GET /api/v1/auth/me` 核验用户，再匹配完整密钥，成功后保存既有的独立使用记录登录态。网站分支若更改存储键、登录路径或接口，仍需适配；不会为登录失败绕过验证码。
- Sub2API 优先显示 `actual_cost`，只有 `total_cost` 时标记“标准价”。New API 沿用站点公开货币换算规则。缺失数值显示 `—`，真实 0 保留，费用最多六位小数；正数低于最小显示精度时显示 `<$0.000001`。
- `first_token_ms` / New API `other.frt` 为毫秒，Sub2API `duration_ms` 为毫秒，New API `use_time` 为秒。缺失时不推测吞吐率或延迟。
- 记录按需读取，支持手动刷新；管理员会话续期与额度查询共用，套餐的用户会话单独续期并保留密钥筛选范围。重连或删除连接后拒绝旧请求的结果，并清理记录登录态。只保留模型、时间、扣费和用量字段，详情关闭即释放，不写入本机额度缓存、小组件或配置导出。

Windows 自建站的手机访问方式见 [手机连接本地 Sub2API](LOCAL_SUB2API.md)。

## 文件结构

- `mobile/src/providers/`：请求、识别、适配器、额度解析。
- `mobile/src/vendor/`：保留来源的实际移植模块及完整许可文本。
- `mobile/src/state/`：钥匙串、配置、余量记录、并发刷新与演示。
- `mobile/src/ui/`：玻璃组件、总览、接入、详情、设置。
- `mobile/src/app/`：Expo Router 页面。
- `.github/workflows/ios.yml`：检查与未签名 iOS 构建。

真实站点的分支版本和权限可能造成字段差异；没有预期字段时报告不支持，不据猜测补额度。可用自定义接口接入其他提供余额端点的站点。
