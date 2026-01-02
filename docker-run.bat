@echo off
set /p replicas="Enter number of replicas (e.g. 2 or 8): "

echo Starting Docker Compose with %replicas% replicas...

docker compose up -d --build --scale trade3-nestjs=%replicas%

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Something went wrong! Check the logs.
    pause
) else (
    echo.
    echo [SUCCESS] Cluster is up and running with %replicas% replicas.
    pause
)
