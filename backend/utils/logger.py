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

    # File Handler
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    log_file = os.path.join(log_dir, "app.log")
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10485760, backupCount=5, encoding="utf8" # 10MB per file
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

logger = setup_logger()
