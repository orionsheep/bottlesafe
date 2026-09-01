# 瓶安 iOS（比赛演示客户端）

SwiftUI · iOS 26 · Swift 6。不发布 App Store。推理在云端 FastAPI，手机只负责拍照和展示。

## 打开工程

```bash
open "/Users/mychanging/Desktop/家庭化学/bottlesafe-ios/BottleSafe.xcodeproj"
```

选一台 iPhone 模拟器或真机，Run。

## 接服务器

App 右上角「已连接 / 未连接」→ 填 API 根地址。

- 模拟器本机后端：`http://127.0.0.1:8000`
- 真机：你的云服务器 `https://域名`（稍后给你的那台）

不要把魔搭密钥写进 App。

## 四页

图鉴 / 识别（系统相机 + 相册，HEIC 转 JPEG）/ 混用（三态结论）/ 档案。

识别成功会留在本机草稿，不必先存档也能去混用。
