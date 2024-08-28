# Big Word Game

Game supporting word based challenges

## Setup

### Environment

```bash
# !/bin/sh .env
export BWG_DICTIONARY_API_KEY=""
export BWG_PORT=""
export BWG_PORT_LOBBY=""

# Config
export BWG_AUTH_ENABLED=1

# Crypto
export BWG_CRYPTO_ALGORITHM="" # Public Key Algorithms Please
export BWG_CERTIFICATE_HOST="" # Generates a certifiate, please state the host eg. localhost
export BWG_CERTIFICATE_EXPIRY="" # How many days until expires
```

```bash
npm install
```


```bash
docker-compose up
```