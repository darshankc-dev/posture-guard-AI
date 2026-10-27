@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo         PostureGuard AI - Windows Build Pipeline
echo ========================================================
echo.

:: 1. Verify Python Installation
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.10 or 3.11 was not found in PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/6] Python found. Setting up virtual environment (.venv)...
if not exist ".venv" (
    python -m venv .venv
)

call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

echo [2/6] Upgrading pip and installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install required packages.
    pause
    exit /b 1
)

echo [3/6] Generating audio notification assets...
python generate_assets.py

echo [4/6] Executing automated test suite...
python tests\run_tests.py
if errorlevel 1 (
    echo [ERROR] Unit tests failed! Packaging aborted.
    pause
    exit /b 1
)
echo [PASS] All automated unit tests passed!

echo [5/6] Bundling Windows standalone executable via PyInstaller...
pyinstaller pyinstaller.spec --clean --noconfirm
if errorlevel 1 (
    echo [ERROR] PyInstaller packaging failed.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo [6/6] BUILD COMPLETED SUCCESSFULLY!
echo Standalone Executable created: dist\PostureGuard AI.exe
echo ========================================================
echo.
pause
