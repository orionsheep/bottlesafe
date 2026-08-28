@echo off
rem BottleSafe 后端 · API 模式（硅基流动）
cd /d "%~dp0"
set CHEM_BACKEND=api
set CHEM_API_BASE=https://api.siliconflow.cn/v1/chat/completions
set CHEM_API_MODEL=Qwen/Qwen3-VL-8B-Instruct
if "%CHEM_API_KEY%"=="" (
  echo Please set CHEM_API_KEY before starting.
  exit /b 1
)
"C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn src.web.app:app --host 0.0.0.0 --port 8000
