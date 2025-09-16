# Bot de Música para Discord

Este proyecto es un bot de Discord desarrollado en Node.js que permite reproducir música desde YouTube y buscar canciones en Spotify. Utiliza las siguientes tecnologías:

- [discord.js](https://discord.js.org/): Interacción con la API de Discord.
- [@discordjs/voice](https://www.npmjs.com/package/@discordjs/voice): Soporte para audio en canales de voz.
- [ytdl-core](https://www.npmjs.com/package/ytdl-core): Descarga y streaming de audio de YouTube.
- [spotify-web-api-node](https://www.npmjs.com/package/spotify-web-api-node): Búsqueda de canciones en Spotify (no reproducción directa).

## Características
- Reproduce música de YouTube en canales de voz de Discord.
- Busca canciones en Spotify y las reproduce desde YouTube.
- Comandos: reproducir, pausar, saltar, detener.

## Instalación
1. Clona este repositorio.
2. Instala las dependencias con `npm install`.
3. Crea un archivo `.env` con tu token de Discord y credenciales de Spotify.
4. Ejecuta el bot con `npm start`.


## Uso con Docker y Makefile

### Comandos esenciales (desde la raíz del proyecto)

```
make up         # Inicia el bot en segundo plano
make down       # Detiene el bot
make restart    # Reinicia el bot
make status     # Ver estado del bot
make logs       # Ver logs en tiempo real
make build      # Construye la imagen de Docker
make clean      # Limpia imágenes y volúmenes antiguos
make deploy     # Limpia y despliega desde cero
make dev        # Modo desarrollo (hot reload si lo configuras)
make prod       # Modo producción
```

### También puedes usar Docker Compose manualmente:

```
cd docker
docker-compose logs -f
docker-compose down
docker-compose restart
docker-compose ps
```

---

## Uso clásico
- Usa comandos como `/play`, `/queue` en tu servidor de Discord.


## Notas
- La API de Spotify no permite reproducir música directamente, solo buscar información de canciones.
- El bot reproduce el audio desde YouTube.
- FFmpeg se instala automáticamente en el contenedor Docker.

---

Reemplaza los valores de ejemplo en `.env` por tus credenciales reales.