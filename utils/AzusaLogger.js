import chalk from 'chalk';
import moment from 'moment-timezone';

export class Logger {
    constructor(timezone = "Asia/Jakarta") {
        this.timezone = timezone;
        
        // Set up global error handlers
        process.on("uncaughtException", (err) => {
            this.log({
                type: "danger",
                message: `Uncaught Exception: ${err.message}`,
                customIcon: "×"
            });
        });
        
        process.on("unhandledRejection", (reason) => {
            this.log({
                type: "danger",
                message: `Unhandled Rejection: ${reason}`,
                customIcon: "×"
            });
        });
    }
    
    getTimestamp() {
        return moment().tz(this.timezone).format("YYYY-MM-DD HH:mm:ss");
    }
    
    log({ type = "info", message = "", customIcon = null }) {
        try {
            const timestamp = this.getTimestamp();
            let symbol, color, logMethod;
            
            switch (type.toLowerCase()) {
                case "primary":
                    symbol = "~";
                    color = chalk.blue;
                    logMethod = console.log;
                    break;
                case "success":
                    symbol = "+";
                    color = chalk.green;
                    logMethod = console.log;
                    break;
                case "danger":
                    symbol = "-";
                    color = chalk.red;
                    logMethod = console.error;
                    break;
                case "warning":
                    symbol = "!";
                    color = chalk.yellow;
                    logMethod = console.log;
                    break;
                case "info":
                    symbol = "*";
                    color = chalk.cyan;
                    logMethod = console.log;
                    break;
                default:
                    symbol = "?";
                    color = chalk.gray;
                    logMethod = console.log;
            }
            
            const finalSymbol = customIcon || symbol;
            logMethod(`[${timestamp}][${color(finalSymbol)}] ${message}`);
        } catch (err) {
            console.error(`[${this.getTimestamp()}][${chalk.red("×")}] Logger Error: ${err.message}`);
        }
    }
    
    handleError(error, customMessage = "An error occurred") {
        this.log({
            type: "danger",
            message: `${customMessage}: ${error.message}`,
            customIcon: "×"
        });
        
        // Log stack trace in development environment
        if (process.env.NODE_ENV !== 'production') {
            console.error(error.stack);
        }
    }
}
