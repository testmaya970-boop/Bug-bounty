@echo off
rem Run by the Windows scheduled tasks "Unpatched\Nightly DB backup" (backup) and
rem "Unpatched\Weekly restore drill" (verify) -- see docs/operations.md. Appends every run,
rem with start/end timestamps and exit code, to backups\backup.log.
cd /d "%~dp0.."
if not exist backups mkdir backups
echo ==== %DATE% %TIME% db:%1 start >> backups\backup.log
if "%1"=="verify" (
  call npm run db:backup:verify >> backups\backup.log 2>&1
) else (
  call npm run db:backup >> backups\backup.log 2>&1
)
set RESULT=%ERRORLEVEL%
echo ==== %DATE% %TIME% db:%1 exit %RESULT% >> backups\backup.log
exit /b %RESULT%
