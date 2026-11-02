# 手机连接 Windows 自建 Sub2API

`127.0.0.1` 是设备自身。电脑把 Sub2API 只绑定在 `127.0.0.1:8080` 时，手机无法直接访问；换一个手机应用也不会改变网络可达性。先让手机 Safari 能打开站点，再把同一个站点地址填入余度的「Sub2API 反代」，使用后台登录或管理密钥选择账号。

## 同一局域网

将实际启动参数 `SERVER_HOST` 与生效配置 `server.host` 统一调整为可接受局域网连接的监听地址，例如官方示例的 `0.0.0.0`，重启后确认实际监听。Windows 防火墙需允许指定本地网络的 TCP 8080；不要把 PostgreSQL 和 Redis 的端口一并开放。手机填电脑可达的局域网 IP 与端口，不填 `127.0.0.1` 或 `0.0.0.0`。

同一个 Wi-Fi 名称不保证设备互通，访客网络、校园网络和无线隔离都可能拦截。iPhone 首次连接时允许应用访问本地网络。余度允许私网 HTTP 地址，但 iOS 对数字 IP 明文访问还有系统限制；无法访问时优先使用下述 HTTPS 入口，不关闭全局网络安全策略。

## 外出或蜂窝网络：私有 HTTPS 入口

个人自用可选择 Tailscale：电脑和手机加入同一个私有网络，电脑用 Tailscale Serve 将本地的 `http://127.0.0.1:8080` 代理到私有 HTTPS 域名。余度填该 HTTPS 站点。原 Sub2API 可以继续只监听本机，不需要公网 IP 或路由器端口映射。首次配置需要本人登录 Tailscale 并启用其 HTTPS 功能。

示例（安装并登录 Tailscale 后在电脑执行）：

```powershell
tailscale serve --bg http://127.0.0.1:8080
```

使用命令实际返回的 HTTPS 地址；该地址仅在私有网络内可访问。手机需要保持 Tailscale 连接，电脑需开机并保持服务运行。若手机已有其他 VPN，先确认能否与 Tailscale 同时满足使用需求。

## 手机无需额外 VPN：固定域名隧道

也可以用 Cloudflare Tunnel 将固定 HTTPS 域名连接到本机 8080，手机直接用 HTTPS 地址。它需要配置账户、域名和访问控制，并为原生 API 请求设计认证，设置量高于私有入口。Cloudflare Access 的浏览器验证码不会自动变成余度的接口凭据。

随机 `trycloudflare.com` Quick Tunnel 适合短期连通测试；官方定位是测试与开发，重启后地址可能改变，不作为余度的长期更新或连接地址。将本地管理后台发布到公网前应明确访问范围和认证方式。

## 一手资料

- Sub2API 官方仓库与监听配置：https://github.com/Wei-Shaw/sub2api/blob/main/README_CN.md
- Tailscale Serve：https://tailscale.com/docs/features/tailscale-serve
- Tailscale Serve 命令：https://tailscale.com/docs/reference/tailscale-cli/serve
- Cloudflare Tunnel：https://developers.cloudflare.com/tunnel/get-started/
- Cloudflare Quick Tunnels：https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
