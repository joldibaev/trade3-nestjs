#!/bin/bash

# Prompt user for input
read -p "Enter number of replicas (e.g. 2 or 8): " replicas

echo "Starting Docker Compose with $replicas replicas..."

# Run docker compose
docker compose up -d --build --scale trade3-nestjs="$replicas"

# Check the exit status of the last command
if [ $? -ne 0 ]; then
    echo -e "\n[ERROR] Something went wrong! Check the logs."
    read -n 1 -s -r -p "Press any key to continue..."
else
    echo -e "\n[SUCCESS] Cluster is up and running with $replicas replicas."
    read -n 1 -s -r -p "Press any key to continue..."
fi
