# Dockerfile para DG Music Bot
FROM node:22-alpine

# Instala ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

CMD ["npm", "start"]
