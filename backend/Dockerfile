# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy database migrations
COPY --from=builder /app/src/database ./src/database

# Create logs directory
RUN mkdir -p logs data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3030
ENV WS_PORT=3031

# Expose ports
EXPOSE 3030 3031

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
