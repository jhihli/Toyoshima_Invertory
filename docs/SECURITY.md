# 安全事件记录与加固计划

> 事件日期：2026-08-26
> 最后更新：2026-08-26

---

## 一、事件摘要

生产服务器（toyoshimainventory.com）遭入侵，被植入挖矿 / C2 木马。

### 时间线

| 时间 | 事件 |
|---|---|
| 2025-12-11 | Next.js 公布 CVE-2025-66478（CVSS 10.0） |
| 2026-08-25 20:44 | next-server (PID 1667) 正常启动，版本 15.1.7（含漏洞） |
| 2026-08-26 00:06 | 木马 (PID 6103) 被 next-server 拉起，开始挖矿 |
| 2026-08-26 14:20 左右 | 因「无法登录」开始排查，发现 gunicorn 未运行 |
| 2026-08-26 14:49 | 发现 CPU 被占满，定位到伪装成 `npm` 的木马进程 |
| 2026-08-26 15:00 左右 | 完成取证、清除木马、切断 C2、升级 Next.js |

木马**运行了约 14 小时**才被发现，且是因为「页面变慢」才引起注意。

### 入侵途径

**CVE-2025-66478** —— React Server Components 协议在反序列化 `Next-Action` 请求头时存在缺陷，攻击者只需一个构造的 HTTP 请求即可在服务器上执行任意代码。

- 严重程度：**CVSS 10.0（满分）**
- 前置条件：**无需任何认证**
- 影响范围：Next.js App Router + RSC（13.x、14.x stable、Pages Router 不受影响）
- 本项目状态：Next.js 15.1.7 + App Router → **命中**，且已暴露约 8 个月

关键证据：木马进程的 `/proc/6103/environ` 中含有 `npm_lifecycle_event=start`、
`npm_package_name=toyoshima-inventory`，证明它是 **next-server 的子进程** ——
即通过运行中的 Next.js 应用获得代码执行权，而非 npm 安装脚本投毒。

### 木马特征

| 项目 | 内容 |
|---|---|
| 进程名 | `npm`（伪装，argv[0] 被篡改） |
| 本体路径 | `frontend/.hllv8om1deh/npm`（隐藏目录 + 随机名，启动后自我删除） |
| SHA256 | `7cde0ffc28a6a25867655b2616cfc6cb01b08e9ba5ba043b26446b5eb8e248a0` |
| 大小 | 3,053,824 bytes |
| C2 地址 | `107.167.83.34:443`（`we.love.servers.at.ioflood.net`，IOFLOOD，美国凤凰城） |
| 资源占用 | 约 3 个 CPU 核心、2.3GB 内存，累计 52 小时 CPU 时间 |
| 规避手法 | 纯内存运行、伪装进程名、使用 `io_uring` 绕过系统调用监控、清理 `/tmp` 日志 |

取证文件保存在服务器 `/root/ir-evidence/`。该样本在公开威胁情报中查不到，属于新样本或定向变种。

---

## 二、已完成的处置

- [x] 关闭对外访问（停止 next-server / 关闭端口转发）
- [x] 终止木马进程 `kill -9 6103`
- [x] iptables 阻断 C2 IP `107.167.83.34`
- [x] 删除隐藏目录 `frontend/.hllv8om1deh/`
- [x] 取证留存至 `/root/ir-evidence/`
- [x] 持久化排查：cron、systemd user units、`.bashrc`/`.profile`/`rc.local`、
      `authorized_keys`、隐藏目录 —— **均未发现残留**
- [x] 升级 Next.js **15.1.7 → 15.1.12**（commit `dc6f107`）
- [x] `package.json` 中 `"next": "latest"` 改为锁定版本 `"next": "15.1.12"`
- [x] gunicorn 改用 systemd 托管（`toyoshima-backend.service`）

> **关于版本选择：** 官方 2025-12 公告建议升到 15.1.9，但该版本现已被 npm 标记为
> deprecated（自身存在安全漏洞）。15.1.x 线上目前**唯一未被废弃**的是 **15.1.12**。
> 15.x 全部 69 个版本中仅 23 个未被废弃，说明该框架安全问题较为频繁，需持续跟进。

---

## 三、待完成事项

### 立即（重新上线前）

- [x] 清理攻击者留下的可疑文件（见下）
- [x] 服务器端彻底重建：`rm -rf node_modules .next` → `npm ci` → `npm run build`
- [x] 前端改用 systemd 托管（`toyoshima-frontend.service`）
- [x] 轮换核心密钥（`SECRET_KEY`、`NEXTAUTH_SECRET`、admin 密码）
- [ ] 开启 GitHub Dependabot 监控（需在网页端点击开启）
- [ ] 确认 docker 组风险（见「六、待确认事项」）

**2026-08-26 恢复上线验证：** 外网 `/login` 返回 200、TTFB 0.033 秒；
`/account/users/` 正常返回校验错误；攻击者投放的 `njs-bl.html` / `agent.sh` / `zs`
均已不可访问。木马运行期间前端 TTFB 为 2.5 秒，现为 0.019 秒（本机）。

### 需清理的可疑文件（已全部清除）

`git status --porcelain` 暴露出的未跟踪文件 —— 已备份至
`/root/ir-evidence/dropped-files/` 后删除，现 `git status` 输出为空：

| 文件 | 风险 |
|---|---|
| `frontend/public/njs-bl.html` | **高危** —— `public/` 目录会原样对外提供访问 |
| `frontend/zs` | **高危** —— 无扩展名，疑似 ELF 可执行文件 |
| `frontend/agent.sh` | 可疑 —— 疑似下载器 / 反弹 shell，**严禁执行** |
| `frontend/njs-bl.html` | 可疑 |
| `frontend/static/` | 可疑 |
| `package-lock.json`（仓库根目录） | 存疑，可能是误操作产生 |
| `backend/server/nohup.out` | 存疑，可能是自己运行 `nohup` 留下的 |

### 需轮换的密钥清单

- [x] Django `SECRET_KEY` —— 2026-08-26 已换
- [x] `NEXTAUTH_SECRET` —— 2026-08-26 已换
- [x] `admin` 密码 —— 2026-08-26 已换
- [ ] `SCANNER_API_KEY` / `NEXT_PUBLIC_API_KEY`（**Zebra 扫描枪 APK 需同步更新**，
      须与 APK 发布同步进行，不可单独修改）
- [ ] PostgreSQL 数据库密码
- [ ] 其余用户密码
- [ ] MSFT Recycling API 订阅密钥
- [ ] 检查 Tailscale 设备列表，移除陌生设备

轮换时发现的两个既有问题（已随本次修复）：

1. **生产与开发共用同一个 `NEXTAUTH_SECRET`** —— 服务器 `.env.production` 与开发机
   `.env.local` 中的值完全相同，泄露面被无谓放大。生产密钥必须独立生成。
2. **原 Django `SECRET_KEY` 含 `#` 字符且未加引号** —— `.env` 解析时 `#` 可能被当作
   注释起始，导致密钥被截断。现统一改用 `secrets.token_urlsafe(64)`（仅含
   `A-Za-z0-9-_`）并加单引号。

生成新密钥的正确做法（**不要让密钥显示在屏幕上**，截图或粘贴过的密钥即视为已泄露）：

```bash
NEW_DJANGO=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
NEW_NEXTAUTH=$(openssl rand -base64 32)
sed -i "s|^SECRET_KEY=.*|SECRET_KEY='$NEW_DJANGO'|"             backend/server/.env.production
sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET='$NEW_NEXTAUTH'|" frontend/.env.production
unset NEW_DJANGO NEW_NEXTAUTH
```

### 短期（一到两周内）

- [ ] 安装 `unattended-upgrades`，开启系统自动安全更新
- [ ] 补齐积压的系统更新（事发时积压 82 个，含 1 个安全更新）
- [ ] systemd 服务加固（`NoNewPrivileges` / `ProtectSystem` / `PrivateTmp` 等）
- [ ] 安装 `fail2ban`
- [ ] 建立 CPU / 负载告警（load > 3 时通知）
- [ ] 每日定时执行 `git status --porcelain`，有输出即告警

---

## 四、网络隔离计划（**搬迁到仓库后执行**）

> **决定：暂缓。** 待办公室搬迁至仓库、服务器与用户处于同一内网后再实施。

这是**性价比最高**的一项加固措施。本系统的使用者只有办公室仓管人员和车间的 Zebra
扫描枪，**没有任何用户在公网上**。若应用不对公网开放，CVE-2025-66478 这类
「无需认证的 RCE」将完全无法触及 —— 攻击者连 TCP 连接都无法建立。

搬迁后的实施方案（择一）：

| 方案 | 说明 | 成本 |
|---|---|---|
| **纯内网访问**（搬迁后首选） | 服务器与用户同一内网，路由器上**关闭 80/443 端口转发** | 免费 |
| **Tailscale** | 服务器已安装 `tailscaled`，将电脑与扫描枪加入同一 Tailnet | 免费 |
| **Cloudflare Tunnel + Access** | 隐藏源站 IP，访问前先过身份验证 | 免费（50 用户内） |
| **IP 白名单** | nginx 仅允许办公室固定公网 IP | 免费，需固定 IP |

**在此之前，系统仍暴露于公网**，因此上面「立即」和「短期」两组事项必须落实到位。

---

## 五、日常运维

### 服务管理

```bash
systemctl status  toyoshima-backend    # Django / gunicorn
systemctl status  toyoshima-frontend   # Next.js
sudo systemctl restart toyoshima-backend
journalctl -u toyoshima-backend -n 50  # 查看日志与报错
```

> **不要再用 `nohup` 或 `gunicorn --daemon` 启动服务。** 事发当天已验证：
> `--daemon` 模式下进程会静默退出且不产生日志，排查极其困难（详见事件排查过程）。

### 部署新代码

```bash
cd ~/Toyoshima_Invertory
git status --porcelain          # 先确认没有意外文件
git pull origin main

# 后端
cd backend/server && source venv/bin/activate
pip install -r requirements.txt && python manage.py migrate
sudo systemctl restart toyoshima-backend

# 前端 —— 必须用 npm ci，不要用 npm install
cd ../../frontend
npm ci && npm run build
sudo systemctl restart toyoshima-frontend
```

`npm ci` 严格按 `package-lock.json` 安装；`npm install` 会去拉取各个 `^` 浮动依赖的
最新版本，既有供应链风险，也会导致服务器与开发机的依赖不一致。

### 健康检查

```bash
curl -s -o /dev/null -w "%{http_code} %{time_starttransfer}s\n" http://127.0.0.1:8000/account/users/
curl -s -o /dev/null -w "%{http_code} %{time_starttransfer}s\n" http://127.0.0.1:3000/login
uptime                          # load average 正常应在 1 以下
```

前端 TTFB 正常应在 **0.05 秒以内**。事发时因 CPU 被木马占满，该值达到 **2.5 秒** ——
**页面突然变慢是入侵的重要信号**，不要简单归因于「网络卡」。

### 环境变量文件名（开发机与服务器不同）

| 环境 | 后端 | 前端 |
|---|---|---|
| 开发机 | `backend/server/.env` | `frontend/.env.local` |
| **服务器** | **`backend/server/.env.production`** | **`frontend/.env.production`** |

后端的选择逻辑写在 `server/settings.py`：存在 `.env.production` 就优先读它，否则读
`.env`。前端则由 Next.js 在 `NODE_ENV=production` 下自动优先读 `.env.production`。

**在服务器上改配置时不要找 `.env`，那个文件不存在。**

---

## 六、待确认事项

### docker 组权限（可能影响「是否已提权到 root」的判断）

`.env.production` 等文件的属组显示为 `docker`，说明 `toyoshimagtech` 用户在 docker 组中。
**docker 组权限等同于 root** —— 组内用户可通过挂载宿主机根目录取得完全控制权（这是
Docker 的设计特性，非漏洞）。

若事发时 Docker 守护进程正在运行，则本次攻击者**有可能已提权至 root**，届时
`/root/ir-evidence/` 中的取证材料、以及「持久化排查未发现残留」的结论都需要按
「root 已失守」重新评估，重装系统的必要性也随之上升。

待执行的确认命令：

```bash
id
which docker
systemctl is-active docker 2>/dev/null || echo "docker not running"
```

- Docker 未安装或守护进程未运行 → 仅为遗留的组配置，风险有限
- Docker 正在运行 → 需重新评估，并考虑将该用户移出 docker 组

---

## 七、服务器实际信息（更正记录）

`CLAUDE.md` 中的以下信息已过期，以此处为准：

| 项目 | 文档记载 | 实际 |
|---|---|---|
| 部署目录 | `~/Toyoshima_Inventory` | **`~/Toyoshima_Invertory`**（拼写如此） |
| 服务器 LAN IP | `192.168.0.15` | **`192.168.1.196`**（网段已变更） |
| Next.js 版本 | 14 | **15.1.12** |
| 服务启动方式 | `nohup` / `gunicorn --daemon` | **systemd unit** |

---

## 八、经验教训

1. **错误提示掩盖了真实故障。** 后端 502 时，登录页显示的是
   「Invalid credentials. Please try again.」，导致最初怀疑方向完全错误。
   `authorize()` 中 `if (!response.ok) return null` 使「服务不可用」与「密码错误」
   走了同一条路径。**待修复。**

2. **性能异常是安全信号。** 「页面变慢」是本次发现入侵的唯一线索。

3. **`git status` 是有效的入侵检测手段。** 攻击者留下的文件全部被它暴露出来。
   建议做成每日定时检查。

4. **浮动版本号是隐患。** `"next": "latest"` 意味着任何一次 `npm install` 都可能
   装到不可预期的版本。生产依赖必须锁定。

5. **依赖漏洞需要主动跟踪。** 漏洞公布于 2025-12-11，直到 2026-08-26 被入侵后才知晓，
   中间有 8 个月的窗口期。Dependabot 可以自动完成这件事。
