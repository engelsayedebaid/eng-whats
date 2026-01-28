@echo off
chcp 65001 >nul
title Copy Project

echo ========================================
echo    نسخ المشروع كنسخة جديدة تماما
echo ========================================
echo.

:: إنشاء اسم عشوائي
set RANDOM_NUM=%RANDOM%
set RANDOM_NAME=eng-whats-copy-%RANDOM_NUM%
set DEST_DIR=C:\Users\ibrah\Desktop\%RANDOM_NAME%

:: إنشاء المجلد
echo [1/4] إنشاء مجلد: %RANDOM_NAME%
mkdir "%DEST_DIR%"

:: نسخ الملفات
echo [2/4] نسخ الملفات...
xcopy "%~dp0*" "%DEST_DIR%\" /E /I /H /Y /EXCLUDE:%~dp0exclude.txt

:: حذف ملفات الجلسات والكاش
echo [3/4] تنظيف الجلسات والكاش...

:: حذف مجلد .chats_cache (الكاش المحلي)
if exist "%DEST_DIR%\.chats_cache" (
    rmdir /s /q "%DEST_DIR%\.chats_cache"
    echo     - تم حذف .chats_cache
)

:: حذف ملف accounts.json (الحسابات المحفوظة)
if exist "%DEST_DIR%\accounts.json" (
    del /q "%DEST_DIR%\accounts.json"
    echo     - تم حذف accounts.json
)

:: حذف .env.local القديم وإنشاء جديد
echo [4/4] إعداد ملف البيئة...

if exist "%DEST_DIR%\.env.local" del "%DEST_DIR%\.env.local"

:: إنشاء ملف .env.local جديد - تعطيل Convex بتغيير الرابط
(
echo # Port مختلف لتشغيل نسخة منفصلة
echo PORT=3001
echo.
echo # تعطيل Convex بإزالة الرابط
echo NEXT_PUBLIC_CONVEX_URL=
echo.
echo # نسخة جديدة
echo INSTANCE_ID=copy-%RANDOM_NUM%
) > "%DEST_DIR%\.env.local"

echo.
echo ========================================
echo    تم بنجاح!
echo ========================================
echo.
echo المشروع الجديد موجود في:
echo %DEST_DIR%
echo.
echo Port: 3001
echo.
echo الخطوات التالية:
echo   1. افتح Terminal في المجلد الجديد
echo   2. شغل: npm install
echo   3. شغل: npm run dev
echo   4. افتح: http://localhost:3001
echo.

:: فتح المجلد
explorer "%DEST_DIR%"

pause
