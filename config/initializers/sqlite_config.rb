# frozen_string_literal: true

# SQLite Performance Configuration
#
# Optimizes SQLite for better performance with Rails.
# These settings are applied when a connection is established.

Rails.application.config.after_initialize do
  if ActiveRecord::Base.connection.adapter_name == "SQLite"
    # Configure all SQLite connections
    ActiveRecord::Base.connection_pool.connections.each do |conn|
      configure_sqlite_connection(conn)
    end

    # Configure new connections as they're created
    ActiveRecord::ConnectionAdapters::SQLite3Adapter.prepend(Module.new do
      def configure_connection
        super
        execute("PRAGMA journal_mode = WAL")       # Write-Ahead Logging for concurrency
        execute("PRAGMA foreign_keys = ON")        # Enforce foreign key constraints
        execute("PRAGMA synchronous = NORMAL")     # Safe but faster sync
        execute("PRAGMA cache_size = -20000")      # 20MB cache (negative = KB)
        execute("PRAGMA mmap_size = 268435456")    # 256MB memory-mapped I/O
        execute("PRAGMA busy_timeout = 5000")      # 5 second busy timeout
        execute("PRAGMA wal_autocheckpoint = 1000") # Checkpoint every 1000 pages
      end
    end)
  end
end

def configure_sqlite_connection(conn)
  return unless conn.respond_to?(:execute)

  conn.execute("PRAGMA journal_mode = WAL")
  conn.execute("PRAGMA foreign_keys = ON")
  conn.execute("PRAGMA synchronous = NORMAL")
  conn.execute("PRAGMA cache_size = -20000")
  conn.execute("PRAGMA mmap_size = 268435456")
  conn.execute("PRAGMA busy_timeout = 5000")
rescue StandardError => e
  Rails.logger.warn("Failed to configure SQLite connection: #{e.message}")
end
