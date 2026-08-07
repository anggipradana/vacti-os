.PHONY: help install dev build typecheck lint test e2e up down migrate seed format

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci
dev: ## Run app + worker in dev
	npm run dev
build: ## Build all projects
	npm run build
typecheck: ## Typecheck all projects
	npm run typecheck
lint: ## Lint code + markdown
	npm run lint && npm run lint:md
test: ## Run quick (unit) tests
	npm run test:quick
e2e: ## Run e2e tests
	npm run e2e
up: ## Start the stack (app + worker + postgres)
	docker compose up --build
down: ## Stop the stack
	docker compose down
migrate: ## Run DB migrations
	npm run db:migrate
seed: ## Seed the database
	npm run db:seed
format: ## Format with Prettier
	npm run format
