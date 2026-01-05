import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp(),
        errors({ stack: true }), // Print stack trace for errors
        json() // Default to JSON for structural integrity and parsing
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }), // Colorize for dev readability
                printf(({ level, message, timestamp, ...metadata }) => {
                    let msg = `${timestamp} [${level}]: ${message}`;
                    if (Object.keys(metadata).length > 0) {
                        msg += ` ${JSON.stringify(metadata)}`;
                    }
                    return msg;
                })
            )
        })
    ],
});

export default logger;
