# Full-Stack Server Operations

Server: AWS Lightsail (2GB) — `52.73.209.183`
SSH key: `.kamal/aws-lightsail-server-key-jan2026.pem` (gitignored)

## SSH into the server

```bash
ssh -i .kamal/aws-lightsail-server-key-jan2026.pem ubuntu@52.73.209.183
```

## Docker containers

### List all running containers
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### View container logs
```bash
docker logs -f <container-name>
docker logs --tail 100 <container-name>
```

### Stop / start / restart a container
```bash
docker stop <container-name>
docker start <container-name>
docker restart <container-name>
```

### Remove a container (stop first)
```bash
docker stop <container-name> && docker rm <container-name>
```

## Kamal proxy

### List proxy routes (which services are publicly exposed)
```bash
docker exec kamal-proxy kamal-proxy list
```

### Remove a proxy route
```bash
docker exec kamal-proxy kamal-proxy remove <service-name>
```

Service names match what `kamal-proxy list` shows (e.g. `aicw-app-rails-web`, `inspector-web`).

## Kamal accessories (sgen, website-builder)

Run these from `apps/web/deployment/full-stack/` with the required env vars set.

### Boot accessories (first time)
```bash
kamal accessory boot website-builder -c config/deploy.yml
kamal accessory boot sgen -c config/deploy.yml
```

### Reboot accessories (pull latest image + restart)
```bash
kamal accessory reboot website-builder -c config/deploy.yml
kamal accessory reboot sgen -c config/deploy.yml
```

### Stop accessories
```bash
kamal accessory stop website-builder -c config/deploy.yml
kamal accessory stop sgen -c config/deploy.yml
```

### View accessory logs
```bash
kamal accessory logs website-builder -c config/deploy.yml
kamal accessory logs sgen -c config/deploy.yml
```

## Kamal Rails app

### Deploy (via CI — push a tag)
```bash
git tag full-v1.x.x && git push --tags
```

### Manual deploy from local machine
```bash
cd apps/web/deployment/full-stack
kamal deploy -c config/deploy.yml --skip-push --version=<tag>
```

### Rails console
```bash
kamal console -c config/deploy.yml
```

### App shell
```bash
kamal shell -c config/deploy.yml
```

### App logs
```bash
kamal logs -c config/deploy.yml
```

### Rollback to previous version
```bash
kamal rollback -c config/deploy.yml --version=<previous-tag>
```

## Health checks

```bash
# Rails (public)
curl https://<DOMAIN>/up

# sgen (from inside Rails container)
docker exec $(docker ps -q -f name=aicw-app-rails-web) curl -sf http://aicw-app-rails-sgen:3001/health

# website-builder (from inside Rails container)
docker exec $(docker ps -q -f name=aicw-app-rails-web) curl -sf http://aicw-app-rails-website-builder:4002/health
```

## Resource monitoring

```bash
# Memory usage per container
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"

# Swap usage
free -h

# Disk usage
df -h /
```

## Memory budget (2GB server)

| Component | Limit | Notes |
|-----------|-------|-------|
| OS + Docker | ~200MB | |
| kamal-proxy | ~30MB | |
| Rails (Puma + SolidQueue) | 700MB | |
| sgen | 512MB | Chromium peaks ~300MB |
| website-builder | 384MB | |
| **Total** | **~1826MB** | ~200MB headroom + 1GB swap |

## Cleanup

```bash
# Prune unused images
docker image prune -f

# Prune everything (stopped containers, unused networks, dangling images)
docker system prune -f
```
