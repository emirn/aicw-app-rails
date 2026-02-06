FROM node:20-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .

RUN mkdir -p /data/aicw-website-builder

EXPOSE 3000
CMD ["node", "src/server.js"]
