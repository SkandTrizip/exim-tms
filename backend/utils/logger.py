import logging
import sys
import os
from logging.handlers import RotatingFileHandler

def setup_logger():
    """
    Sets up a global logger for the application.
    Logs are written to both the console and a rotating file.
    """
    logger = logging.getLogger("exim_tms")
    logger.setLevel(logging.INFO)

    # Formatter for the logs
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File Handler — optional so a read-only /app/logs volume cannot crash boot
    log_dir = os.getenv("LOG_DIR", "logs")
    try:
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "app.log")
        file_handler = RotatingFileHandler(
            log_file, maxBytes=10485760, backupCount=5, encoding="utf8"
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError:
        console_handler.setLevel(logging.INFO)
        logger.warning("File logging disabled; could not write to %s", log_dir)

    return logger

logger = setup_logger()
