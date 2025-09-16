# Dockerfile para DG Music Bot
FROM node:22-alpine

# Instala ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /src
COPY package*.json ./
RUN npm install --ignore-scripts
COPY . .

CMD ["npm", "start"]
