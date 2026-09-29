# MSFT Recycling API — Buyback 上报流程(端到端)

> 配套文档:[MSFT_LOCAL.md](MSFT_LOCAL.md)(如何在本地安全运行)、[SECURITY.md](SECURITY.md)
> 首个真实 award 全流程跑通:**2026-09-11**(SO5-000533,July 2026 Special Project)

---

## 一、概览

Buyback 需按顺序上报 3 个报告,靠 **`supplierPoNumber`** 串联:

```
Credit Details  →  PO Document (v2)  →  Payment Notification (PNR)
```

- 全部**本地专用**(微软凭据不上生产服务器)。运行方式见 [MSFT_LOCAL.md](MSFT_LOCAL.md)。
- **两层认证**:OAuth2 Bearer token(Entra client-credentials)+ `Ocp-Apim-Subscription-Key`。
  每次请求另带唯一 `Correlation-Id`、`ProgramType: CLOUD`、`TenantId`。
- UI:SO 详情页(vendor=MSFT)的 **MSFT Report** 标签;或管理命令 `push_msft_report`。

---

## 二、一次 award 的完整流程(业务 + API,按时间)

1. **中标** — 微软发 award(芯片清单 + 总额,例:$4,500)。
2. **开 PO** — Toyoshima(ITAD)开一张采购单提交微软审批(Nivrutti 批)。**已批准的 PO 号**即
   `supplierPoNumber`(本案 = `SO5-000533`,与内部 SO 号相同)。**微软不生成 SO 号**
   (Karanvir 2026-08-13 确认)。
3. **建 SO** — 系统里建一个 vendor=MSFT 的 SO(可无 pallet/board,仅用于上报)。
   SO 号 = **`supplierJobID`**(代码自动取,不手填)。
4. **填 Job Info**(MSFT Report tab)— Job Type=Buyback、Company Code(如 1010)、PO Number、
   Currency、Billing Country → **Save**(仅本地存,不发微软)。
5. **填 Credit 明细** — 每颗芯片一行。
6. **上传 PO PDF**。
7. **Push Credit → Push PO(v2)** — PO 推成功后,微软 SAP **自动开发票**(得 `msInvoiceNumber`)。
8. **付款** — Toyoshima 按发票号付款给微软。
9. **填 Payment Notification → Push PNR** — 上报付款,收尾。三报告齐 = award 完成。

---

## 三、字段映射(硬规则)

| 概念 | 值 / 规则 |
|---|---|
| `supplierJobID` | = SO 号(代码自动) |
| `supplierPoNumber` | = 已批准的 Toyoshima PO 号;**Job Info + 每行 Credit + PO + PNR 全部一致** |
| Credit `unitType` | 生产只接受 **Memory / CPU**(见坑①);DRAM→Memory,FPGA/PCH/Controller(AST1050/SLKM8)→CPU(暂) |
| Credit `salePrice` | = 该行 Ext Price(数量 × 单价) |
| Credit `supplierCommission` | 本案 **0**(零 margin:$4,500 全额欠微软) |
| Credit `msRevenueShare` | = `salePrice − supplierCommission`;本案 = `salePrice`;**所有行合计 = award 总额** |
| Credit `dateSold` | 真实卖出日 |
| PO(v2)`supplierPoAmount` / `totalSupplierPoAmount` | = award 总额($4,500);`tax1`/`tax2`/`totalFreightCharges` = 0 |
| PO `fileContent` | PO PDF 的 base64(代码自动;本地推送时 PDF 必须在本地 `MEDIA_ROOT`) |
| PNR `msInvoiceNumber` | 来自 SAP 开的发票(本案 `1800273317`) |
| PNR `paymentDate` / `paymentAmount` / `paymentAmountUSD` | 付款日 / 金额($4,500) |

---

## 四、端点

base 由 `.env` 的 `MSFT_ENVIRONMENT` 切换:
- **test**:`https://p2p.azure-api.net/recycling/api/devicerecycling`(无 `v1`)
- **prod**:`https://supplier-api.microsoft.com/recycling/v1/api/devicerecycling`

子路径:
- Credit → `/creditdetails`
- PO → **`/v2/podocument`**(带金额,SAP 开票必须;旧 `/podocument` 会丢金额 → 见坑②)
- PNR → `/paymentnotifications`

成功 = **HTTP 200** + `errorResponses: []`(+ `successResponses` 列出各条)。

---

## 五、关键坑(实战教训)

① **unitType 只能 Memory / CPU** — 生产对 `Other` 返回
   **`1009 "Unit Type is not valid for the provided program type"`**。AST1050(Aspeed 控制芯片)、
   FPGA、Intel PCH(SLKM8)统一填 **CPU**(待 Varun/Amit 最终确认枚举)。文档里的枚举更宽,但本
   program type 实际只收 Memory/CPU。

② **PO 金额必须走 v2** — 旧 `/podocument` 不接受金额,微软记录会是 `0`,**SAP 不会自动开票**
   (Amit 2026-09-09 确认)。必须用 **`/v2/podocument`** + `supplierPoAmount` /
   `totalSupplierPoAmount` / `tax1` / `tax2` / `totalFreightCharges`。

③ **`1040 "Supplier PO Number does not belong to any Job ID"`** — 通常是微软那边**删了 credit**
   (job 不存在了)。解决 = **重推 Credit(重建 job)再推 PO**。(把 `supplierJobID` 塞进 PO
   payload 无用,已验证。)

④ **PO PDF 文件** — 本地推送时 `build_po_document` 读本地 `MEDIA_ROOT` 的文件;若 DB 里的路径
   原本在服务器上,本地需按同一相对路径放一份 PDF,否则报 `FileNotFoundError`。

⑤ **token / 订阅密钥** — token 每次现取、1 小时过期自动重取;订阅密钥每次请求必带。两者是**两道
   独立认证**,谁都不能替代谁。

⑥ **环境徽章 ≠ 数据库** — UI 顶部 `PROD/TEST` 只表示**微软端点**,不表示连的哪个库。真实推送前
   **必须跑 preflight** 确认连的是生产库(见 MSFT_LOCAL.md);web 按钮本身没有这道防线。

---

## 六、首个完成案例(SO5-000533,2026-09-11)

- award:July 2026 Special Project,8 颗芯片,总额 **$4,500**。
- Credit(8 units)`200` — Correlation-Id `4ac60168-d8fe-4e24-9ae8-08a1bd51b553`
- PO(v2,$4,500)`200` — Correlation-Id `be2db2a4-7ed8-40e0-87fc-2b6c34cb33e9`
- 发票:**`1800273317`**(SAP 自动开)
- PNR($4,500)`200` — Correlation-Id `1978ef4f-8e50-4d22-a988-ef91501143de`

芯片映射(本案):AST1050→CPU、D9MNQ/D9SFT/K4B1G1646G-BC19/NT5CB64M16FP-DH/NT5TU64M16HG-AC→Memory、
EP4CE15F23C9LN(FPGA)→CPU、SLKM8(Intel PCH)→CPU。

---

## 七、如何运行

见 [MSFT_LOCAL.md](MSFT_LOCAL.md):**SSH 隧道 → preflight(必跑)→ 后端 runserver(生产库)→
前端 npm run dev → 浏览器 MSFT Report tab**;或用管理命令
`python manage.py push_msft_report --report credit|podoc|pnr --so <pk>`。

> 未完的收尾(与本 award 无关):在 Entra 轮换 client secret、请微软重发 APIM 订阅密钥
> (2026-08 入侵事件遗留,见 SECURITY.md / MSFT_LOCAL.md)。
