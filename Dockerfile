# Imagen del backend de Bravos. Se construye con: docker compose -f deploy/docker-compose.yml build
FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=America/Argentina/Buenos_Aires
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p uploads/documentos && chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
