#!/bin/bash

# 🚀 POS Backend Docker Startup Script
# This script starts all backend services with a single command

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting POS Backend Services...${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ docker-compose is not installed.${NC}"
    exit 1
fi

# Create necessary directories
mkdir -p logs data

# Check if .env file exists, if not create from example
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Created .env from .env.example - Please update with your settings${NC}"
    fi
fi

# Parse arguments
TOOLS=false
REBUILD=false
STOP=false
LOGS=false

for arg in "$@"; do
    case $arg in
        --tools)
            TOOLS=true
            ;;
        --rebuild)
            REBUILD=true
            ;;
        --stop)
            STOP=true
            ;;
        --logs)
            LOGS=true
            ;;
        --help)
            echo "Usage: ./start.sh [options]"
            echo ""
            echo "Options:"
            echo "  --tools     Include phpMyAdmin for database management"
            echo "  --rebuild   Force rebuild of containers"
            echo "  --stop      Stop all running containers"
            echo "  --logs      Show logs after starting"
            echo "  --help      Show this help message"
            exit 0
            ;;
    esac
done

# Stop command
if [ "$STOP" = true ]; then
    echo -e "${YELLOW}🛑 Stopping all containers...${NC}"
    docker compose down
    echo -e "${GREEN}✅ All containers stopped${NC}"
    exit 0
fi

# Build command
BUILD_CMD=""
if [ "$REBUILD" = true ]; then
    BUILD_CMD="--build"
    echo -e "${YELLOW}🔨 Rebuilding containers...${NC}"
fi

# Tools profile
PROFILE_CMD=""
if [ "$TOOLS" = true ]; then
    PROFILE_CMD="--profile tools"
    echo -e "${YELLOW}🛠️  Including development tools (phpMyAdmin)${NC}"
fi

# Start services
echo -e "${GREEN}📦 Starting Docker containers...${NC}"
docker compose $PROFILE_CMD up -d $BUILD_CMD

# Wait for services to be ready
echo ""
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"

# Wait for MySQL
echo -n "   MySQL: "
for i in {1..30}; do
    if docker compose exec -T mysql mysqladmin ping -h localhost -u root -proot > /dev/null 2>&1; then
        echo -e "${GREEN}Ready ✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for Backend
echo -n "   Backend: "
for i in {1..20}; do
    if curl -s http://localhost:3030/health > /dev/null 2>&1; then
        echo -e "${GREEN}Ready ✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All services are running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "   🌐 API Server:    ${GREEN}http://localhost:3030${NC}"
echo -e "   🔌 WebSocket:     ${GREEN}ws://localhost:3031${NC}"
echo -e "   💾 MySQL:         ${GREEN}localhost:3306${NC}"

if [ "$TOOLS" = true ]; then
    echo -e "   🗄️  phpMyAdmin:    ${GREEN}http://localhost:8080${NC}"
fi

echo ""
echo -e "To view logs:        ${YELLOW}docker compose logs -f${NC}"
echo -e "To stop services:    ${YELLOW}./start.sh --stop${NC}"
echo ""

# Show logs if requested
if [ "$LOGS" = true ]; then
    echo -e "${YELLOW}📋 Showing logs (Ctrl+C to exit)...${NC}"
    docker compose logs -f
fi
