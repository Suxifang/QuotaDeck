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

## 文件结构

- `mobile/src/providers/`：请求、识别、适配器、额度解析。
- `mobile/src/vendor/`：保留来源的实际移植模块及完整许可文本。
- `mobile/src/state/`：钥匙串、配置、余量记录、并发刷新与演示。
- `mobile/src/ui/`：玻璃组件、总览、接入、详情、设置。
- `mobile/src/app/`：Expo Router 页面。
- `.github/workflows/ios.yml`：检查与未签名 iOS 构建。

真实站点的分支版本和权限可能造成字段差异；没有预期字段时报告不支持，不据猜测补额度。可用自定义接口接入其他提供余额端点的站点。
