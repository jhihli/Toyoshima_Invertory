# Pallet ↔ MPN 指定 & Checklist 芯片下拉 — 设计

日期：2026-10-01
范围：仅 MSFT Order（`/sos/`）。Sales Orders（`/sales-orders/`）不在本次范围。

## 背景与目标

不再扫描板子条码（Zebra 已停用，标签改由 K388Pro 打印），系统因此无法得知每个 pallet 里有哪些板子（MPN）。

目标：

1. 在 MSFT Order 页新增 **Boards** tab，让用户直接把 MPN（以及每个 MPN 的板子数）指定给 pallet。
2. Checklist 编辑弹窗中，Brand / Model 改为**芯片下拉**，只列出该 pallet 已指定 MPN 下的芯片；Qty 手填。
3. 移除整个扫描 Board 功能（表、API、页面、照片），所有原本靠 Board 记录的计数改用新数据来源。

成功标准（端到端）：进入 SO S05-000617 → 点 pallet 24 → Boards tab 加入 DCS-7060CX-32S（board qty 25）→ 进 pallet 24 的 Checklist → 编辑 `S05-000617-05LP00075408-24-1` → 下拉选 `Broadcom · BCM56960B1KFSBG` → qty 40 → 保存，表格显示 Broadcom / BCM56960B1KFSBG / 40。

## 已确认的决定

| # | 决定 |
|---|---|
| 1 | Pallet 与 MPN 为多对多；每个 (pallet, MPN) 组合有自己的 board_qty |
| 2 | 指定入口：MSFT Order 页新 Boards tab（逐个 pallet） |
| 3 | 只做 MSFT Order |
| 4 | Checklist 只能从下拉选芯片，不允许手打 |
| 5 | Scan board 整个移除；计数这次一起改 |
| 6 | `Pallet.board_qty` 改为自动等于各 MPN 加总，不再手填 |
| 7 | 旧 pallet 过渡：没有任何 MPN 行 → 显示旧手填数字并标"旧数据"；有 MPN 行 → 加总 |
| 8 | 回填后立即删除 `board` 表及板子照片 |
| 9 | 有 MPN 行但 qty 全空 → 显示 0 |
| 10 | 删除保护：被 checklist 引用的 MPN 不能从 pallet 移除；被引用的 Chip 不能删除 |
| 11 | Export "Date processed" 用 `PalletMPN.created_at` |

## 1. 数据模型

### 新表 `PalletMPN`（`db_table = 'pallet_mpn'`）

| 字段 | 定义 |
|---|---|
| `pallet` | FK → Pallet，`on_delete=CASCADE`，`related_name='pallet_mpns'` |
| `mpn` | FK → MPN，`on_delete=PROTECT`，`related_name='pallet_mpns'` |
| `board_qty` | `IntegerField(null=True, blank=True)` — 该 MPN 在该 pallet 上的板子数 |
| `created_at` | `DateTimeField(default=timezone.now)` |

- `unique_together = [('pallet', 'mpn')]`
- `ordering = ['pallet', 'mpn__name']`

同一 MPN 出现在多个 pallet 时，每个 pallet 各一行、各自的 qty，加总时不会重复计算。

### `Pallet`

- 原字段 `board_qty` 保留，语义改为**旧的手填数据（只读）**。新增/编辑 pallet 的 API 与表单不再接受它。
- 新属性（唯一实现位置，其他地方一律调用）：

```python
@property
def effective_board_qty(self):
    rows = self.pallet_mpns.all()
    if rows:                       # 有任何 MPN 行 → 加总，空白当 0
        return sum(r.board_qty or 0 for r in rows)
    return self.board_qty          # 没有 MPN 行 → 旧手填（可能为 None）

@property
def board_qty_is_legacy(self):
    return not self.pallet_mpns.exists() and self.board_qty is not None
```

（实现时用 `prefetch_related('pallet_mpns')` 避免 N+1。）

### `SO`

- `total_board_count` 与 `total_board_qty` 合并为同一值：所有 pallet 的 `effective_board_qty` 加总（None 当 0）。两个 API 字段名都保留，避免前端/导出断裂。

### `MPN`

- 板子数 = `Sum(PalletMPN.board_qty)`（跨所有 SO、所有 pallet，None 当 0）。

### `Checklist`

- 新增 `chip = FK(Chip, null=True, blank=True, on_delete=PROTECT, related_name='checklists')`。
- 保存规则（serializer 层）：
  - `chip` 有值时，`chip.mpn` 必须存在于 `checklist.pallet.pallet_mpns`，否则 400。
  - 服务器把 `brand = chip.brand.name`（无品牌则空）、`model = chip.chip_mpn`；客户端传的 brand/model 文字被忽略。
  - `chip` 为空的旧行，brand/model 原样保留。
- 扫描接口 `scanner/pallets/<pk>/checklists/bulk/` 不改，仍接受 brand/model 文字。

### 删除保护

- 删除 `PalletMPN`：若该 pallet 有 checklist 的 `chip.mpn` = 该 MPN → 400 `{ "error": "Used by N checklist lines" }`。
- 删除 `Chip`：`PROTECT` 生效；MPN 页的芯片删除接口捕获 `ProtectedError` → 400 `{ "error": "Chip is used by N checklist lines" }`。
- 删除 `MPN`：已有的 PROTECT 改由 `PalletMPN.mpn` 承担。

## 2. Migration

单一 migration（`RunPython` + schema 操作），顺序：

1. 建 `pallet_mpn`；`checklist` 加 `chip_id`。
2. 回填：`Board` 按 `(pallet_id, mpn_id)` 分组，`board_qty = Sum('qty')`，`created_at = Min('scanned_at')`。`pallet` 或 `mpn` 为空的 Board 行无法回填，丢弃并 `print` 数量。回填逻辑抽成纯函数 `backfill_pallet_mpns(Board, PalletMPN)` 以便测试。
3. 删除 `Board` model / `board` 表。

板子照片文件（`MEDIA_ROOT/boards/`）不由 migration 删除，部署时手动删。

### 部署附加步骤（在标准 update 流程中，`migrate` 之前/之后）

```bash
# migrate 之前：备份（不可逆操作）
pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > ~/backup_before_pallet_mpn_$(date +%F).sql

python manage.py migrate      # 观察输出的丢弃数量

# migrate 成功之后：删除板子照片
rm -rf /var/www/toyoshima/media/boards
```

## 3. 删除范围（Board）

后端：
- `Board` model、`BoardSerializer` 及相关 serializer 字段
- URL：`sos/<so_pk>/boards/`、`sos/<so_pk>/boards/bulk/`、`boards/<pk>/`、`boards/<pk>/photo/`、`boards/<board_pk>/chips/`、`boards/<board_pk>/chips/<pk>/`、`scanner/boards/<board_pk>/photo/`
- `views.py`：`board_list_by_so`、`board_bulk_create`、`board_detail`、`board_photo`、`chip_create`、`chip_detail`（board 版）、`scanner_board_photo`、`scanner_api` 中的 `_board_inbound` 分支
- `mpn_detail` 的 `mpn.boards.count()`、`send_mpn_report.py` 的 board 计数与"最后扫描时间"

MPN 页芯片 CRUD 走 `mpns/<mpn_pk>/chips/...`，不受影响。

前端：
- MSFT Order 页 Boards tab（旧）、Add board 扫码弹窗、`loadBoards` 等状态
- 页面 `/sos/[id]/boards/[boardId]/`
- `api.boards`、`api.chips`（board 版）及 `Board` 类型

## 4. 后端 API（新增 / 修改）

均在 `/product/` 下，JWT 认证，遵循现有错误约定。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `pallets/<pallet_pk>/mpns/` | 列表：`id`, `mpn`, `mpn_name`, `part_type`, `chips_per_board`, `board_qty`, `checklist_use_count`, `created_at` |
| POST | `pallets/<pallet_pk>/mpns/` | body `{ "items": [{ "mpn": id, "board_qty": n\|null }] }`；整批验证，已存在或 MPN 不存在 → 400，整批不写入；成功 201 回传新建行 |
| PATCH | `pallets/<pallet_pk>/mpns/<pk>/` | 修改 `board_qty` |
| DELETE | `pallets/<pallet_pk>/mpns/<pk>/` | 204；被使用 → 400 |
| GET | `sos/<so_pk>/pallet-mpns/` | SO 内全部 PalletMPN 行（只读，给 Export 用）：`pallet`, `mpn`（含 chips）, `board_qty`, `created_at` |
| GET | `pallets/<pallet_pk>/chip-options/` | `[{ mpn_id, mpn_name, chips: [{ id, brand_name, chip_mpn, slot_group }] }]` |

修改：
- `pallets/<pallet_pk>/checklists/<pk>/` PUT/PATCH 接受 `chip`（规则见 §1）；回传增加 `chip`。
- Pallet serializer：`board_qty` 改为只读，值为 `effective_board_qty`；新增 `board_qty_is_legacy`。
- SO serializer：`total_board_count` / `total_board_qty` 按 §1。
- MPN serializer / `mpn_detail`：板子数按 §1。
- `chips_per_board` 复用 `MPN` 现有的 slot 逻辑（`_slots()` 加总），不另写。

## 5. 前端

### MSFT Order 页（`frontend/app/(main)/sos/[id]/page.tsx`）

Tabs：`Pallets | Boards`（加 `msft` tab 时照旧）。

**Pallets tab**
- 点行（`onGoToBoards`）→ 切到 Boards tab，选中该 pallet。
- Boards 列显示 `board_qty`；`board_qty_is_legacy` 为真时旁边加灰色 **旧数据** 标签。
- 新增 / 编辑 / 批量新增 pallet 表单移除 board qty 输入。

**Boards tab（新）** — 抽成独立组件 `app/ui/pallet/PalletBoardsTab.tsx`，避免 page.tsx（已 2700+ 行）再膨胀。
- 顶部 Pallet 下拉（沿用现有 pallet 下拉样式）。
- 合计行："N MPNs · M boards"。
- 表格：MPN（链到 MPN 页）| Part type | Chips/board | Board qty（inline 编辑，blur 保存）| Checklist 使用数 | 删除按钮（被使用时删除失败，toast 显示服务器错误）。
- **+ Add board** 弹窗：可搜索多选 MPN（排除 `is_finished` 与本 pallet 已有的），每个已选 MPN 一个 board qty 输入（可空），一次 POST。
- 增删改后刷新 SO（以更新顶部 BOARDS 与 Pallets 列表数字）。

### Checklist 编辑弹窗（`app/ui/pallet/ChecklistCard.tsx`）

- Brand + Model 两个输入框 → 一个可搜索芯片下拉，按 MPN 分组，选项文字 `{brand} · {chip_mpn}`；数据来自 `chip-options`。
- Qty 输入不变。
- pallet 无 MPN：下拉位置显示"此 pallet 尚未指定 board"，附链接回 SO 页 Boards tab（带该 pallet）。
- 旧行（`chip` 为空但有 brand/model 文字）：下拉上方灰字"原资料：{brand} / {model}"。
- 列表 Brand / Model 列仍显示文字字段，不变。

### MPN 页（`frontend/app/(main)/mpns/[id]/page.tsx`）

- "BOARDS (SCANNED)" → "BOARDS"，值改为新加总。

### SO Export（`handleExport`）

数据来源由 `api.boards.listBySO` 改为 `GET sos/<so_pk>/pallet-mpns/`（见 §4）。逻辑由"每条 Board 计 1"改为"每行计 `board_qty`（None 当 0）"：

- Processing PCB：Part Qty = 同 LP + MPN 的 board_qty 加总；Date processed = 该组最晚的 `created_at`。
- Board BOM / Activity Based Processing Cost / Service_Cost_Example：`boardCount` = SO 内该 MPN 的 board_qty 加总。
- Chip BOM / Processing chips / Inventory：芯片集合取自 SO 内所有 PalletMPN 的 MPN，逻辑不变。

## 6. 测试

后端 `product/tests.py`：
- `effective_board_qty`：有 MPN 行 / 仅旧数据 / MPN 行 qty 全空（=0）。
- 同一 MPN 在多个 pallet：SO 加总、MPN 跨 SO 加总正确；`(pallet, mpn)` 重复 POST → 400。
- Checklist 选不属于该 pallet 的芯片 → 400；选合法芯片 → brand/model 被覆盖为芯片资料。
- 删除保护：被引用的 PalletMPN、Chip 删除 → 400。
- `backfill_pallet_mpns`：多块同 pallet 同 MPN 板合并、跨 pallet 分开、缺 pallet/mpn 的被丢弃。
- 扫描 checklist bulk 接口行为不变（现有测试保持通过）。

前端：`npm run lint` + `npm run build`，再实际跑起来走一遍"成功标准"流程，并下载一次 Export 检查 Processing PCB 数字。

## 不做

- Sales Orders 页面。
- 扫描接口（pallet / box / checklist）的改动。
- 从 pallet 页批量把一个 MPN 套到多个 pallet。
