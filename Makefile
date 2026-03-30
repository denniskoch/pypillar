.PHONY: run install lint docker-build docker-run docker-stop docker-logs

IMAGE  := pypillar
PORT   := 8000

# ── Local dev ──────────────────────────────────────────
run:
	.venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port $(PORT)

install:
	python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

lint:
	.venv/bin/ruff check .

# ── Docker ─────────────────────────────────────────────
docker-build:
	docker build -t $(IMAGE) .

docker-run:
	docker run -d \
		--name $(IMAGE) \
		--env-file .env \
		-p $(PORT):8000 \
		--restart unless-stopped \
		$(IMAGE)

docker-stop:
	docker stop $(IMAGE) && docker rm $(IMAGE)

docker-logs:
	docker logs -f $(IMAGE)
