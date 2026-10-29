.PHONY: install install-api install-web dev-api dev-web test typecheck lint

PYTHON ?= ./venv/bin/python
PIP ?= ./venv/bin/pip
PYTEST ?= ./venv/bin/pytest
UVICORN ?= ./venv/bin/uvicorn

install: install-api install-web

install-api:
	python3 -m venv venv
	$(PIP) install -r requirements.txt

install-web:
	npm --prefix web install

dev-api:
	$(UVICORN) api.main:app --reload --host 127.0.0.1 --port 8000

dev-web:
	npm --prefix web run dev

test:
	$(PYTEST) -q
	npm --prefix web test

typecheck:
	npm --prefix web run typecheck

lint:
	npm --prefix web run lint
