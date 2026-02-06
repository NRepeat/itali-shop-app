# Makefile for itali-shop-app
# Usage: make <target>

#----------- Make Environment ----------------------
SHELL=/bin/sh
docker_bin=$(shell command -v docker 2> /dev/null)
docker_compose_bin=$(shell if command -v docker-compose > /dev/null 2>&1; then echo 'docker-compose'; else echo 'docker compose'; fi)

# Export all variables from .env automatically
ifneq (,$(wildcard .env))
  include .env
  export
endif

# Default environment
ENV_FILE ?= .env
COMPOSE_FILE = docker-compose.yaml

# Ensure .env exists
check-env:
	@if [ ! -f .env ]; then \
		echo "[ERROR] .env file not found. Copy .env.example to .env"; \
		exit 1; \
	fi

# Build all Docker images
build: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) build

# Start all services in detached mode
up: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d

# Start all services and rebuild
up-build: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up --build -d

# Stop all services
down:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down

# Show logs
logs:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f

# Show logs for app only
logs-app:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f app

# Show logs for all workers
logs-workers:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f worker-sync worker-price-notification worker-collection

# Show logs for redis
logs-redis:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f redis

# Enter shell in a running container: make shell-app
shell-%:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) exec $* sh

ps:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) ps --all

# Prune Docker images with itali-shop-app label
prune:
	$(docker_bin) image prune -f --filter 'label=image-name=itali-shop-app'

# Build only app image
build-app: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) build app

# Start only app service
up-app: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d app

# Start only workers
up-workers: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d worker-sync worker-price-notification worker-collection

# Start only redis
up-redis: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d redis

# Run database seed (migrate + seed data)
seed: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) --profile seed up seed

# Restart app service
restart-app:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) restart app

# Restart all workers
restart-workers:
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) restart worker-sync worker-price-notification worker-collection

# Full deploy: build and start
deploy: check-env
	$(docker_compose_bin) -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up --build -d

# Print help
help:
	@echo "=========== itali-shop-app Makefile ==========="
	@echo ""
	@echo "Docker Commands:"
	@echo "  build            Build all Docker images"
	@echo "  up               Start all services in detached mode"
	@echo "  up-build         Start all services and rebuild images"
	@echo "  down             Stop all services"
	@echo "  logs             Show logs from all containers"
	@echo "  logs-app         Show logs from app container only"
	@echo "  logs-workers     Show logs from all workers"
	@echo "  logs-redis       Show logs from redis"
	@echo "  ps               List all containers"
	@echo "  prune            Remove dangling Docker images"
	@echo ""
	@echo "App Commands:"
	@echo "  build-app        Build only the app image"
	@echo "  up-app           Start only the app service"
	@echo "  restart-app      Restart the app service"
	@echo "  deploy           Build and start all services"
	@echo "  seed             Run database migrations and seed data"
	@echo ""
	@echo "Worker Commands:"
	@echo "  up-workers       Start all workers"
	@echo "  restart-workers  Restart all workers"
	@echo "  up-redis         Start only redis"
	@echo ""
	@echo "Container Access:"
	@echo "  shell-<svc>      Enter shell in a running container (e.g. make shell-app)"
	@echo "=========================================="
