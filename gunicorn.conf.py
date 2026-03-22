import os

bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
workers = 1  # SQLite doesn't support concurrent writers, keep single worker
preload_app = True
timeout = 120

def post_fork(server, worker):
    """Start the R2 backup scheduler in the worker process."""
    from server.app import start_backup_scheduler
    start_backup_scheduler()
