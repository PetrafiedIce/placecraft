FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

# Persisted canvas state lives in /app/data — mount a volume here in production.
VOLUME ["/app/data"]

CMD ["node", "server.js"]
