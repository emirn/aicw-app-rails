#!/bin/bash
# Setup script for AWS Lightsail server
# Run this on your Lightsail instance after SSH'ing in
#
# Usage: ssh ubuntu@YOUR_IP 'bash -s' < scripts/setup-server.sh

set -e

echo "=== AICW Website Builder - Server Setup ==="

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ubuntu
    echo "Docker installed. You may need to log out and back in for group changes."
else
    echo "Docker already installed"
fi

# Create data directories
echo "Creating data directories..."
sudo mkdir -p /data/aicw_wb_data
sudo chown ubuntu:ubuntu /data/aicw_wb_data

# Create letsencrypt directory for Traefik SSL
sudo mkdir -p /letsencrypt
sudo chmod 700 /letsencrypt

# Install Docker Compose (optional, for local testing)
echo "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Configure firewall
echo "Configuring firewall..."
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable

echo ""
echo "=== Server setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Log out and log back in for Docker group changes"
echo "2. On your local machine, run: kamal env push"
echo "3. Then run: kamal deploy"
echo ""
