# Walsh Content Hub API image (AC17). uv-based, Python 3.12.
FROM python:3.12-slim

# uv for fast, reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml ./
RUN uv sync --no-dev

COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# create_app is a factory; uvicorn --factory instantiates it with env-driven Settings.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
