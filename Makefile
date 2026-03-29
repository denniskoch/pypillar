.PHONY: run lint install

run:
	.venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port 8000

install:
	python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

lint:
	.venv/bin/ruff check .
