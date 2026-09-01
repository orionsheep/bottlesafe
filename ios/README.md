# 瓶安 iOS（比赛演示客户端）

SwiftUI · Swift 6 · iOS 26。不上 App Store。推理在云端 FastAPI，手机只负责拍照和展示。

## 打开

```bash
open "/Users/mychanging/Desktop/家庭化学/bottlesafe-ios/BottleSafe.xcodeproj"
```

Xcode → Settings → Components 下载 **iOS 26 Simulator** 后，选 iPhone 模拟器 Run。真机：选你的 Team，插上 iPhone 运行。

## 四页（与手机网页对齐）

| Tab | 功能 |
|---|---|
| 图鉴 | 危害图鉴、日光三法则、去识别 |
| 识别 | 系统相机 + 相册；HEIC 转 JPEG；读标签；存档；去混用 / 去档案 |
| 混用 | 两槽选瓶；本轮草稿不必先存档；danger / unknown / no_edge 三态 |
| 档案 | 卡片台账、删除、全屋报告、时间线 |

右上角「已连接」打开服务器设置：

- 模拟器：`http://127.0.0.1:8000`
- 真机云端：面板放行后填 `http://218.11.5.249` 或 `:10380`

密钥只放服务器，不打进 App。
