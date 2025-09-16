# Dockerfile para DG Music Bot
FROM node:22-alpine

# Instala ffmpeg y dependencias del sistema
RUN apk add --no-cache ffmpeg python3 make g++ && \
    ln -sf python3 /usr/bin/python

# Crea directorio de trabajo
WORKDIR /app

# Copia package.json y crea una versión sin scripts prepare
COPY package.json package-lock.json ./
RUN sed -i '/"prepare":/d' package.json || true

# Instala solo dependencias de producción
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copia código fuente
COPY . .

# Crea usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001 -G nodejs

# Crea directorio para datos persistentes con permisos apropiados
RUN mkdir -p /app/data && \
    chown -R botuser:nodejs /app && \
    chmod 755 /app/data

# Cambia a usuario no-root
USER botuser

# Puerto para healthcheck (opcional)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
