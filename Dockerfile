FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    postgresql \
    postgresql-contrib \
    redis-server \
    git \
    curl \
    wget \
    openssl \
    unzip \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY . /opt/panel

WORKDIR /opt/panel

EXPOSE 3000

SHELL ["/bin/bash", "-c"]
CMD ["bash"]
