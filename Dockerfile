FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# Copy node_modules (includes compiled better-sqlite3 for alpine/musl)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server.js package.json ./
VOLUME ["/app/data"]
EXPOSE 3210
EXPOSE 3211
CMD ["node", "server.js"]
