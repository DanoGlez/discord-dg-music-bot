# Makefile para DG Music Bot

up:
	docker-compose -f docker/docker-compose.yml up -d

down:
	docker-compose -f docker/docker-compose.yml down

restart:
	docker-compose -f docker/docker-compose.yml restart

status:
	docker-compose -f docker/docker-compose.yml ps

logs:
	docker-compose -f docker/docker-compose.yml logs -f

build:
	docker-compose -f docker/docker-compose.yml build

clean:
	docker system prune -af --volumes

deploy: down clean build up

dev:
	docker-compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

prod:
	docker-compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d
