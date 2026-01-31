#!/bin/bash

# Prompt user for input
read -p "Enter number of replicas (e.g. 2 or 8): " replicas

echo "Starting Docker Compose with $replicas replicas..."

# Run docker compose
docker compose up -d --build --scale trade3-nestjs="$replicas"

if [ $? -ne 0 ]; then
    echo -e "\n\033[0;31m[ERROR] Something went wrong! Check the logs.\033[0m"
else
    echo -e "\n\033[0;32m[SUCCESS] Cluster is up and running with $replicas replicas.\033[0m"
fi

echo "Press Enter to exit..."
read
