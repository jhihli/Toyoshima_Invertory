# MSFT Report —— 本地专用运行手册

> 生效日期：2026-08-26
> 背景：见 [SECURITY.md](SECURITY.md)

---

## 为什么要这样做

2026-08-26 生产服务器被入侵（Next.js CVE-2025-66478，无需认证的 RCE），攻击者以
`toyoshimagtech` 身份获得了约 14 小时的代码执行权限，`.env.production` 里的所有内容
都必须视为已泄露。

而 MSFT Recycling API 的集成**不只是一个 API key**，它是一整套 Microsoft 身份凭据：

| 变量 | 性质 |
|---|---|
| `MSFT_CLIENT_SECRET` | Entra ID（Azure AD）应用密钥，等同于应用身份 |
| `MSFT_CLIENT_ID` / `MSFT_TENANT_ID` | 配合上者即可换取访问令牌 |
| `MSFT_PROD_SUBSCRIPTION_KEY` | Azure APIM 订阅密钥 |

持有这套凭据，就能以**供应商 0003072650（豊島）的身份**向微软推送贷记明细、PO 单据、
付款通知 —— 也就是能以你们的名义提交虚假财务数据。

**结论：这套凭据不能放在暴露于公网的机器上。** 因此该功能整体改为本地专用。

---

## 拆分方式

代码结构上，这个功能天然分为两层，切分很干净：

| 层 | 内容 | 去向 |
|---|---|---|
| **数据结构** | `models.py` 里的 8 个 Msft 模型 + `migration 0042` | ✅ **保留在仓库和服务器** |
| **功能代码** | client、payloads、views、serializers、urls、admin、管理命令、前端面板 | 🔒 **本地专用，gitignore** |

### 为什么模型必须保留

模型定义和迁移是**数据库结构的记录**。如果把它们从仓库里删掉，下次在服务器上执行
`makemigrations` 时，Django 会认为这些模型被删除了，从而生成**删表迁移**，把
credit units、payment notices、推送日志等全部数据销毁。

模型定义本身**不包含任何机密**（只是字段声明），留着不构成任何安全风险。

### 本地专用的文件清单

这些路径已写入 `.gitignore`，**不在 GitHub、不在服务器**：

```
backend/server/product/msft/                                  整个包
    ├── __init__.py
    ├── client.py          调用微软 API（唯一使用凭据的地方）
    ├── payloads.py        组装报表 JSON
    ├── serializers.py     从 product/serializer.py 抽出
    ├── views.py           从 product/views.py 抽出（10 个接口）
    ├── urls.py            10 条路由
    └── admin.py           8 个模型的 Django admin 注册（本地录入用）
backend/server/product/management/commands/push_msft_report.py
backend/server/product/management/commands/seed_msft_master.py
local-only/frontend-msft/MsftReportPanel.tsx.txt              前端面板存档
```

### 服务器上不存在这些代码时如何保证不报错

`product/urls.py` 和 `product/admin.py` 用 `try / except ImportError` 有条件地接入：

```python
try:
    from .msft.urls import urlpatterns as msft_urlpatterns
except ImportError:
    pass
else:
    urlpatterns += msft_urlpatterns
```

**已实测验证：**

| 环境 | `manage.py check` | 注册的 msft 路由数 |
|---|---|---|
| 本地（包存在） | 无问题 | **10** |
| 服务器（包不存在） | 无问题 | **0** |

前端也已实测 `npm run build` 通过 —— MSFT Report 标签页已从 SO 详情页移除，
`app/lib/api.ts` 中的 `api.msft.*` 整块删除。`interface/IDatatable.ts` 里的
`Msft*` 类型定义予以保留：它们只是接口形状声明，不含机密，留着便于日后恢复。

---

## 本地操作流程

### 一、准备凭据文件（只在你自己的电脑上，且不要放进项目目录）

`~/msft-push.env`：

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5433                    # SSH 隧道的本地端口
export DB_NAME=<生产库名>
export DB_USER=<生产库用户>
export DB_PASSWORD=<生产库密码>

export MSFT_ENVIRONMENT=prod
export MSFT_TENANT_ID=...
export MSFT_CLIENT_ID=...
export MSFT_CLIENT_SECRET=...
export MSFT_RESOURCE_SCOPE=...
export MSFT_PROD_SUBSCRIPTION_KEY=...
```

> 原理：`settings.py` 用的 `load_dotenv()` 默认 `override=False`，**不会覆盖**已存在的
> 环境变量。所以 shell 里 `export` 的值会盖过 `.env` 文件，无需改动任何代码。

### 二、建立到生产数据库的隧道（终端 1，保持开着）

```bash
ssh -L 5433:127.0.0.1:5432 toyoshimagtech@<服务器地址>
```

### 三、数据录入（终端 2）

```bash
cd backend/server && source venv/Scripts/activate
source ~/msft-push.env
python manage.py runserver
```

浏览器打开 **http://127.0.0.1:8000/admin/**，用 admin 账号登录，即可对
Job Info、Credit Unit、Payment Notice、Company Code、Unit Type 等进行增删改查。

> Push 历史（`MsftApiLog`）在 admin 里是**只读**的 —— 它是发给微软内容的审计记录，
> 由 `push_msft_report` 写入，不应手工编辑。

### 四、推送

```bash
# 先 dry-run：组装并校验 JSON，不发任何网络请求
python manage.py push_msft_report --report credit --so <SO主键> --dry-run

# 确认无误后正式推送
python manage.py push_msft_report --report credit --so <SO主键>
```

`--report` 可选 `credit`（贷记明细）、`podoc`（PO 单据）、`pnr`（付款通知）。

推送完成后 `unset` 环境变量或直接关闭终端。

### 五、审计记录不受影响

管理命令会把 correlation_id、endpoint、HTTP 状态、请求负载、成功/失败数写入
`MsftApiLog` 表。因为连接的就是生产库，**推送历史与改造前完全一致，一条不少**。

---

## 安全效果对比

| | 改造前 | 改造后 |
|---|---|---|
| 微软凭据存放位置 | 🔴 暴露在公网的服务器上 | ✅ 只在本地电脑 |
| RCE 能否拿到凭据 | 🔴 能 | ✅ 服务器上根本没有 |
| 推送接口 | 🔴 `POST /sos/<pk>/msft/push/` 对外存在 | ✅ 路由不存在 |
| 其余 9 个 MSFT 接口 | 🔴 存在 | ✅ 路由不存在 |
| 数据库中的历史数据 | — | ✅ 完整保留 |
| 仓储流程（`/sos` MSFT Order 区） | 正常 | ✅ 完全不受影响 |

> 注意：应用层的 `IsAdminOrManager` 权限校验**挡不住 RCE** —— 攻击者根本不走登录流程。
> 这正是要在「路由层面让接口不存在」而不只是「加权限」的原因。

---

## 服务器端一次性清理

代码通过 `git pull` 自动消失，但**凭据必须手工清除**（`.env.production` 不在版本控制中）：

```bash
cd ~/Toyoshima_Invertory/backend/server
cp .env.production .env.production.bak-msft-$(date +%F)

for k in MSFT_CLIENT_SECRET MSFT_CLIENT_ID MSFT_TENANT_ID MSFT_RESOURCE_SCOPE \
         MSFT_PROD_SUBSCRIPTION_KEY MSFT_TEST_SUBSCRIPTION_KEY MSFT_SUBSCRIPTION_KEY; do
  sed -i "s|^${k}=.*|${k}=|" .env.production
done

# 确认已清空（应全部输出 0）
for k in MSFT_CLIENT_SECRET MSFT_CLIENT_ID MSFT_TENANT_ID MSFT_RESOURCE_SCOPE \
         MSFT_PROD_SUBSCRIPTION_KEY MSFT_TEST_SUBSCRIPTION_KEY MSFT_SUBSCRIPTION_KEY; do
  awk -F= -v k="$k" '$1==k {print k, length($2)}' .env.production
done
```

`MSFT_SUPPLIER_ID`、`MSFT_SUPPLIER_NAME`、`MSFT_PROGRAM_TYPE`、`MSFT_ENVIRONMENT`
**保留** —— 这些不是机密，组装报表时要用。

确认新配置运行正常后，销毁备份：

```bash
shred -u .env.production.bak-msft-*
```

---

## 仍需完成

- [ ] **在 Entra ID 轮换 client secret** —— 移走凭据不等于旧凭据失效。
      Azure Portal → App registrations → 该应用 → Certificates & secrets →
      新建 secret → 更新到 `~/msft-push.env` → 删除旧 secret
- [ ] **联系微软 CDO 团队更换 subscription key**
- [ ] **检查 Entra ID 登录日志** —— Sign-in logs → Service principal sign-ins，
      按 `MSFT_CLIENT_ID` 过滤，时间从 2026-08-26 00:00 起，确认来源 IP 是否只有
      服务器的公网地址。出现陌生 IP（尤其 `107.167.83.34`）即表示凭据已被利用
- [ ] **检查该应用注册的 API permissions** —— 若除 Recycling API 外还有
      Microsoft Graph / Directory 等权限，影响范围需重新评估
- [ ] **考虑主动告知微软** —— 供应商凭据存在暴露可能，便于对方核查
      supplier 0003072650 名下有无异常提交

---

## 日后如何恢复网页版 UI

`local-only/frontend-msft/MsftReportPanel.tsx.txt` 保留了原前端面板。恢复步骤：

1. 复制回 `frontend/app/(main)/sos/[id]/MsftReportPanel.tsx`
2. 在 `app/lib/api.ts` 中恢复 `api.msft.*` 调用块
3. 在 `app/(main)/sos/[id]/page.tsx` 中恢复 import、`canMsft`、tab 项与渲染

**但请注意：只应在内网环境下这么做。** 只要系统仍对公网开放，这个面板就会把凭据
重新带回攻击面之内。
