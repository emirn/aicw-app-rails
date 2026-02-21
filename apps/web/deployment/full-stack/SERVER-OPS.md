# Server Operations Guide

This document covers operational procedures for the production server.

## Database Backups with Litestream

The server uses Litestream for continuous SQLite database replication to S3.

### Configuration

- **Replication Interval**: Every 10 seconds (main DB), 1 minute (cache/queue)
- **Retention**: 30 days (main DB), 7 days (cache/queue)
- **Snapshot Interval**: 24 hours (full copy)
- **Storage**: S3 bucket `aicw-db-backups`

### Checking Backup Status

```bash
# View Litestream logs
kamal accessory logs litestream

# Check if replication is working (should show continuous activity)
kamal accessory logs litestream --tail 50
```

### Restoring from Backup

See full documentation in the file for complete restore procedures.

