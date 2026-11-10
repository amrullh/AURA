@echo off
REM ============================================================================
REM  AURA - Start semua layanan untuk penjurian (Windows)
REM  Menyalakan: PostgreSQL, agent (FastAPI), backend (NestJS produksi),
REM  lalu Cloudflare Tunnel HTTPS.
REM
REM  PENTING sebelum menjalankan:
REM   1. Jangan biarkan laptop sleep: Power & sleep -> Never (adaptor DAN baterai)
REM   2. Tunda Windows Update auto-restart
REM   3. Biarkan jendela ini terbuka. Menutupnya = semua layanan berhenti.
REM ============================================================================
title AURA - Server Penjurian (JANGAN DITUTUP)
cd /d "%~dp0"

set PGBIN=C:\Users\LENOVO\scoop\apps\postgresql\current\bin
set PGDATA=D:\pgdata-aura
set AGENT_PORT=8000

echo.
echo ============================================================
echo   AURA - Menyalakan seluruh layanan
echo ============================================================
echo.

REM --- 1. PostgreSQL -----------------------------------------------------------
echo [1/4] PostgreSQL...
netstat -ano | findstr ":5432 " | findstr LISTENING >nul
if %errorlevel%==0 (
  echo       sudah berjalan.
) else (
  "%PGBIN%\pg_ctl" -D "%PGDATA%" -l "%PGDATA%\log.txt" -o "-p 5432" start
  timeout /t 3 /nobreak >nul
)
echo.

REM --- 2. Agent (FastAPI) ------------------------------------------------------
echo [2/4] Agent AI di port %AGENT_PORT%...
start "AURA Agent" cmd /k "cd /d "%~dp0agent" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %AGENT_PORT%"
timeout /t 5 /nobreak >nul
echo.

REM --- 3. Backend NestJS (mode produksi) --------------------------------------
echo [3/4] Backend API di port 3000...
start "AURA Backend" cmd /k "cd /d "%~dp0backend" && npm run start:prod"
timeout /t 8 /nobreak >nul
echo.

REM --- 4. Cloudflare Tunnel ----------------------------------------------------
echo [4/4] Cloudflare Tunnel...
echo.
echo   Salin alamat https://....trycloudflare.com yang muncul di bawah ini.
echo   Alamat itu yang dipakai FE di Vercel sebagai VITE_API_BASE_URL.
echo   PERHATIAN: alamat quick tunnel berubah setiap kali dijalankan ulang.
echo.
cloudflared tunnel --url http://localhost:3000 --no-autoupdate

echo.
echo ============================================================
echo   Tunnel berhenti. Layanan lain tetap berjalan sampai
echo   jendela "AURA Agent" dan "AURA Backend" ditutup.
echo ============================================================
pause
