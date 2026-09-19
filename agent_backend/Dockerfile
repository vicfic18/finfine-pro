# syntax=docker/dockerfile:1
FROM public.ecr.aws/docker/library/python:3.11-slim

# Include AWS Lambda Web Adapter binary
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

# Lambda Web Adapter configuration
ENV PORT=8080
ENV AWS_LWA_INVOKE_MODE=buffered
ENV AWS_LWA_READ_TIMEOUT_MS=900000

WORKDIR /var/task

# Install uv for fast, reliable package installations
RUN pip install --no-cache-dir uv

# Install locked production dependencies into /var/task/.venv
COPY agent_backend/pyproject.toml agent_backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Activate the virtualenv
ENV PATH="/var/task/.venv/bin:$PATH"

# Copy application source and canonical skills guides from project root
COPY agent_backend/finfine_agent ./finfine_agent
COPY skills ./skills

# Environment configuration
ENV FINFINE_SKILLS_DIRECTORY=/var/task/skills
ENV PYTHONPATH=/var/task

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "finfine_agent.api:app", "--host", "0.0.0.0", "--port", "8080"]
