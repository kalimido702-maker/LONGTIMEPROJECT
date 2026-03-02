#!/bin/bash

# 🚀 POS Backend Deploy Script
# Deploys backend to server: stops, builds, and starts Docker
# Usage: ./deploy.sh [mode] [--no-cache]
# Modes: full, quick, migrate, logs, restart

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════
# Configuration - Update these values for your server
# ═══════════════════════════════════════════════════════════════════
SERVER_IP="13coffee.net"
SERVER_USER="root"
REMOTE_PATH="/home/coffee/htdocs/13coffee.net"
CONTAINER_NAME="pos-backend"
LOCAL_BACKEND_PATH="$(dirname "$0")"

# ═══════════════════════════════════════════════════════════════════
# Parse arguments
# ═══════════════════════════════════════════════════════════════════
MODE="${1:-full}"
NO_CACHE=""

for arg in "$@"; do
    case $arg in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
    esac
done

# ═══════════════════════════════════════════════════════════════════
# Helper functions
# ═══════════════════════════════════════════════════════════════════
print_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}   🚀 POS Backend Deploy Script${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "   ${BLUE}Server:${NC} ${SERVER_USER}@${SERVER_IP}"
    echo -e "   ${BLUE}Remote Path:${NC} ${REMOTE_PATH}"
    echo -e "   ${BLUE}Mode:${NC} ${MODE}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

show_usage() {
    echo -e "${YELLOW}Usage:${NC} ./deploy.sh [mode] [options]"
    echo ""
    echo -e "${GREEN}Modes:${NC}"
    echo "  full      - Full deploy: upload all files, rebuild Docker, run migrations (default)"
    echo "  quick     - Quick deploy: upload files and restart container (no rebuild)"
    echo "  migrate   - Run database migrations only"
    echo "  logs      - Show container logs"
    echo "  restart   - Restart container only"
    echo "  status    - Show container status"
    echo "  shell     - Open shell in container"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo "  --no-cache  - Rebuild Docker without cache (only for 'full' mode)"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  ./deploy.sh                  # Full deploy with cache"
    echo "  ./deploy.sh full --no-cache  # Full deploy without cache"
    echo "  ./deploy.sh quick            # Quick deploy (just restart)"
    echo "  ./deploy.sh migrate          # Run migrations"
    echo "  ./deploy.sh logs             # View logs"
    echo ""
}

upload_files() {
    echo -e "${YELLOW}📦 Uploading files to server...${NC}"
    
    rsync -avz --progress \
        --exclude 'node_modules' \
        --exclude 'dist' \
        --exclude 'logs/*' \
        --exclude '.git' \
        --exclude '.DS_Store' \
        --exclude '*.log' \
        --exclude 'data/' \
        --exclude '.env' \
        --exclude '.env.*' \
        "${LOCAL_BACKEND_PATH}/" "${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/"
    
    # Upload firebase config files from data/ (if they exist)
    if [ -f "${LOCAL_BACKEND_PATH}/data/firebase-service-account.json" ]; then
        echo -e "${YELLOW}📤 Uploading Firebase config...${NC}"
        rsync -avz --progress \
            "${LOCAL_BACKEND_PATH}/data/firebase-service-account.json" \
            "${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/data/"
    fi
    
    echo -e "${GREEN}✅ Files uploaded successfully${NC}"
}

rebuild_docker() {
    local build_args=$1
    
    echo -e "${YELLOW}🔨 Rebuilding Docker container...${NC}"
    
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        cd ${REMOTE_PATH}
        
        echo "🛑 Stopping current container..."
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
        
        echo "🔨 Building new image ${build_args}..."
        docker build ${build_args} -t ${CONTAINER_NAME} .
        
        echo "🚀 Starting new container..."
        docker run -d \
            --name ${CONTAINER_NAME} \
            -p 3030:3030 \
            -p 3031:3031 \
            --restart unless-stopped \
            --env-file .env \
            --add-host=host.docker.internal:host-gateway \
            -v ${REMOTE_PATH}/data:/app/data \
            -v ${REMOTE_PATH}/logs:/app/logs \
            ${CONTAINER_NAME}
        
        echo "⏳ Waiting for service to be ready..."
        sleep 5
        
        # Check health
        if curl -s http://localhost:3030/api/health > /dev/null 2>&1; then
            echo "✅ Backend is healthy!"
        else
            echo "⚠️ Backend might need more time to start"
            echo "Check logs with: docker logs -f ${CONTAINER_NAME}"
        fi
ENDSSH
    
    echo -e "${GREEN}✅ Docker rebuilt and started${NC}"
}

restart_container() {
    echo -e "${YELLOW}🔄 Restarting container...${NC}"
    
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker restart ${CONTAINER_NAME}
        
        echo "⏳ Waiting for service to be ready..."
        sleep 3
        
        if curl -s http://localhost:3030/api/health > /dev/null 2>&1; then
            echo "✅ Backend is healthy!"
        else
            echo "⚠️ Backend might need more time to start"
        fi
ENDSSH
    
    echo -e "${GREEN}✅ Container restarted${NC}"
}

run_migrations() {
    echo -e "${YELLOW}🗃️ Running database migrations...${NC}"
    
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec ${CONTAINER_NAME} npm run migrate 2>/dev/null || \
        docker exec ${CONTAINER_NAME} npx ts-node src/database/runMigrations.ts 2>/dev/null || \
        echo "⚠️ No migration script found or migration failed"
ENDSSH
    
    echo -e "${GREEN}✅ Migrations complete${NC}"
}

show_logs() {
    echo -e "${YELLOW}📋 Showing container logs (Ctrl+C to exit)...${NC}"
    ssh -t ${SERVER_USER}@${SERVER_IP} "docker logs -f --tail 100 ${CONTAINER_NAME}"
}

show_status() {
    echo -e "${YELLOW}📊 Container Status:${NC}"
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        echo ""
        docker ps -a --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "Health check:"
        if curl -s http://localhost:3030/api/health > /dev/null 2>&1; then
            echo "✅ Backend is healthy!"
        else
            echo "❌ Backend is not responding"
        fi
ENDSSH
}

open_shell() {
    echo -e "${YELLOW}🐚 Opening shell in container...${NC}"
    ssh -t ${SERVER_USER}@${SERVER_IP} "docker exec -it ${CONTAINER_NAME} /bin/sh"
}

print_success() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   ✅ Deployment Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "   🌐 API:    http://${SERVER_IP}:3030"
    echo -e "   📋 Logs:   ./deploy.sh logs"
    echo -e "   🔄 Status: ./deploy.sh status"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════
# Main execution
# ═══════════════════════════════════════════════════════════════════

case $MODE in
    full)
        print_header
        upload_files
        echo ""
        rebuild_docker "$NO_CACHE"
        echo ""
        run_migrations
        print_success
        ;;
    
    quick)
        print_header
        upload_files
        echo ""
        restart_container
        print_success
        ;;
    
    migrate)
        print_header
        run_migrations
        ;;
    
    logs)
        show_logs
        ;;
    
    restart)
        print_header
        restart_container
        ;;
    
    status)
        print_header
        show_status
        ;;
    
    shell)
        open_shell
        ;;
    
    help|--help|-h)
        show_usage
        ;;
    
    *)
        echo -e "${RED}❌ Unknown mode: ${MODE}${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac
