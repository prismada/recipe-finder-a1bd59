FROM node:20-slim

# Install Chromium and dependencies for browser automation
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-symbola \
    fonts-noto-color-emoji \
    git \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome path for the agent
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3002

CMD ["node", "dist/server.js"]
