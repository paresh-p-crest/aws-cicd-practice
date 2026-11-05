# A small, official Node image. Pinning the version keeps builds repeatable.
FROM node:22-alpine

WORKDIR /app

# Copy manifests first. Docker caches this layer, so dependencies are only
# reinstalled when package.json actually changes, not on every code edit.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
