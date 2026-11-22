@echo off
REM Local development on Windows: starts MongoDB, the backend and the frontend.
REM Run from anywhere — paths are relative to this file.
set ROOT=%~dp0

start "MongoDB" powershell -NoExit -Command "mongod --dbpath C:\data\db"
timeout /t 3
start "Twin backend" powershell -NoExit -Command "cd '%ROOT%backend'; npm run dev"
timeout /t 3
start "Twin frontend" powershell -NoExit -Command "cd '%ROOT%frontend'; npm start"
