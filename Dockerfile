FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5199
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY server.js ./server.js
COPY api ./api
COPY features ./features
COPY lib ./lib
COPY scripts ./scripts
EXPOSE 5199
USER node
CMD ["node", "server.js"]
