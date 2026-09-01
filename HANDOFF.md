# 瓶安 BottleSafe · 两套前端，别搞混

后端始终共享：`app/backend`，端口 **8000**。识别引擎和混用图谱两端一样。

---

## 怎么跑（路演）

| 服务 | 地址 | 代码 |
|---|---|---|
| 后端 API | http://127.0.0.1:8000 | `bottlesafe-new/bottlesafe/app/backend`（git **main**） |
| 手机改造版 | http://localhost:3200 | 同上仓库 `app/frontend`（git **main**） |
| 电脑杂志版 | http://localhost:3400 | `bottlesafe-desktop/`（git **desktop-mix**，是 `2d50808` 的 worktree） |

```bash
# 后端（当前演示用云端视觉，不占本地 GPU）
cd "/Users/mychanging/Desktop/家庭化学/bottlesafe-new/bottlesafe/app/backend"
CHEM_BACKEND=api .venv-ui/bin/python -m uvicorn src.web.app:app --host 127.0.0.1 --port 8000

# 手机
cd "/Users/mychanging/Desktop/家庭化学/bottlesafe-new/bottlesafe/app/frontend"
PORT=3200 npx vinext dev -p 3200

# 电脑
cd "/Users/mychanging/Desktop/家庭化学/bottlesafe-desktop/app/frontend"
PORT=3400 npx vinext dev -p 3400
```

**不要把 `desktop-mix` merge 进 main。** main 是手机改造树（有 `AppShell`、`/m/*`）；电脑是独立 worktree。混在一起会把两套 UI 叠进同一路由。

---

## 路由（两端都是四页）

| 路由 | 电脑 3400 | 手机 3200 |
|---|---|---|
| `/` | 杂志首页 HOME/HAZARD | 图鉴（AppShell） |
| `/scan` | 拍一瓶、存档；可跳混用/档案 | 拍一瓶、存档；可跳混用/档案 |
| `/mix` | 选两瓶点「混合」 | 同上，底栏「混用」 |
| `/archive` | 宽屏卡片台账 + 全屋报告 | 瀑布流台账 + 全屋报告 |

电脑顶栏：**危害图鉴 · AI 识别 · 禁忌混用 · 家宅档案**（首页「安全之道」正文仍在，导航不挂这个标签）。

手机底栏：**图鉴 · 识别 · 混用 · 档案**。3200 用 middleware 把 `/` `/scan` `/mix` `/archive` rewrite 到 `/m/*`。

---

## 混用怎么判

`POST /api/mix` 只对两瓶做图谱交叉，**不写档案**。`verdict` 只有三种，页面必须三种样子：

| verdict | 含义 | 界面 |
|---|---|---|
| `danger` | 命中禁忌边（如 84×洁厕灵→氯气） | 红/珊瑚对撞提示 |
| `unknown` | 至少一瓶对不上已知成分 | 琥珀色「混用结果未知，不要混合」 |
| `no_edge` | 两瓶都对上了，但这一对比没有边 | 「已知禁忌表里没有这一对，仍不要混合」 |

禁止写成「可以混合」「安全」。

识别成功会写入浏览器 `sessionStorage`（`bottlesafe-mix-session`），**不必先存档**也能进混用候选。`/mix?prefill=1` 会预填本轮最近两瓶。存档成功后再给「去档案」。

---

## 动手前检查

```bash
ls app/frontend/app/
```

| 看到 | 面对的是 |
|---|---|
| 有 `DeskNav.tsx`、`mix/`、`archive/`，**没有** `AppShell.tsx` | 电脑端 → `bottlesafe-desktop`，分支 `desktop-mix` |
| 有 `AppShell.tsx`、`m/` | 手机端 → `bottlesafe-new`，分支 `main` |

先明确改的是手机还是电脑，再动手。电脑改动提交到 `desktop-mix` 并 push；手机+后端提交到 `main`。
