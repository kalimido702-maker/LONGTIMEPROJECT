# Build stage
FROM node:20-alpine AS builder

# Install build tools needed for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Install production-only dependencies in a clean folder
RUN rm -rf node_modules && npm ci --omit=dev

# Production stage (clean, no build tools)
FROM node:20-alpine AS production

WORKDIR /app

# Copy production node_modules from builder (already compiled)
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy database migrations
COPY --from=builder /app/src/database ./src/database
COPY --from=builder /app/src/database/migrations ./dist/database/migrations

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
