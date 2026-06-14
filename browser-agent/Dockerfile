# Scaffold Dockerfile — image will only run real browsers once Playwright is
# installed and ENABLE_BROWSER_AGENT=1 is set at runtime.
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=optional --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8788
EXPOSE 8788

CMD ["node", "dist/index.js"]
