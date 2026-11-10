@echo off
REM ============================================================================
REM  AURA - Cek status semua layanan + alamat tunnel
REM  Jalankan kapan saja untuk memastikan semuanya masih hidup.
REM ============================================================================
title AURA - Status Layanan
set PGBIN=C:\Users\LENOVO\scoop\apps\postgresql\current\bin

echo.
echo ============================================================
echo   STATUS LAYANAN AURA
echo ============================================================
echo.

echo [PostgreSQL :5432]
netstat -ano | findstr ":5432 " | findstr LISTENING >nul && echo    HIDUP || echo    MATI
echo.

echo [Backend API :3000]
netstat -ano | findstr ":3000 " | findstr LISTENING >nul && echo    HIDUP || echo    MATI
echo.

echo [Agent AI :8000]
netstat -ano | findstr ":8000 " | findstr LISTENING >nul && echo    HIDUP || echo    MATI
echo.

echo [Uji health agent]
curl -s -m 5 http://localhost:8000/health
echo.
echo.

echo [Uji API backend]
curl -s -m 5 -o nul -w "    HTTP %%{http_code}" http://localhost:3000/docs
echo.
echo.

echo ============================================================
echo   Kalau ada yang MATI, jalankan start-penjurian.cmd
echo ============================================================
pause
