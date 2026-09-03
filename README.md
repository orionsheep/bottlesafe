# 瓶安 iOS（比赛演示客户端）

SwiftUI · Swift 6 · iOS 26。不上 App Store。推理在云端 FastAPI，手机只负责拍照和展示。

## 打开

```bash
open "/Users/mychanging/Desktop/家庭化学/bottlesafe-ios/BottleSafe.xcodeproj"
```

Xcode → Settings → Components 下载 **iOS 26 Simulator** 后，选 iPhone 模拟器 Run。真机：选你的 Team，插上 iPhone 运行。

## 五页（与手机网页对齐，混用仍是一级 Tab）

| Tab | 功能 |
|---|---|
| 图鉴 | 首页 hero、能力条、危害图鉴配图、日光三法则、去识别 |
| 识别 | 系统相机 + 相册；家庭画像含储存三态；绿色处置；规则/证据/混用预警 |
| 混用 | 两槽选瓶；规则库/AI 徽章；同位提醒；danger / caution / unknown / no_edge |
| 档案 | 混用入口、搜索筛选、位置 PATCH、全屋报告 |
| 我的 | 画像、AI 安全管家、分析历史、家庭报告、反馈 |

右上角「已连接」打开服务器设置：

- 模拟器：`http://127.0.0.1:8000`
- 真机云端：面板放行后填 `http://218.11.5.249` 或 `:10380`

密钥只放服务器，不打进 App。
