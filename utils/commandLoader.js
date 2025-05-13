import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Logger } from "./AzusaLogger.js";

const logger = new Logger();

/**
 * Loads all command modules from the commands directory
 * @param {string} commandsDir - Path to commands directory
 * @returns {Map} - Map of command names to command modules
 */
async function loadCommands(commandsDir) {
    const commands = new Map();
    const commandFiles = [];

    try {
        // Get absolute path
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const absCommandsDir = path.resolve(__dirname, "..", commandsDir);

        // Check if directory exists
        if (!fs.existsSync(absCommandsDir)) {
            logger.log({
                type: "warning",
                message: `Commands directory not found: ${absCommandsDir}`
            });
            fs.mkdirSync(absCommandsDir, { recursive: true });
            logger.log({
                type: "info",
                message: `Created commands directory: ${absCommandsDir}`
            });
            return commands;
        }

        // Read all .js files in the directory
        const files = fs
            .readdirSync(absCommandsDir)
            .filter(file => file.endsWith(".js"));

        logger.log({
            type: "info",
            message: `Found ${files.length} command files`
        });

        // Import each command file
        for (const file of files) {
            try {
                const filePath = path.join(absCommandsDir, file);
                const relativePath = path.relative(".", filePath);
                const importPath = "/" + relativePath.replace(/\\/g, "/");

                const command = await import(
                    `file://${path.resolve(filePath)}?update=${Date.now()}`
                );

                // Validate command structure
                if (
                    !command.default ||
                    !command.default.name ||
                    !command.default.execute
                ) {
                    logger.log({
                        type: "warning",
                        message: `Invalid command structure in ${file}. Skipping...`
                    });
                    continue;
                }

                // Add command to map
                commands.set(command.default.name, command.default);

                // Add aliases if present
                if (
                    command.default.aliases &&
                    Array.isArray(command.default.aliases)
                ) {
                    command.default.aliases.forEach(alias => {
                        commands.set(alias, command.default);
                    });
                }
            } catch (error) {
                logger.handleError(
                    error,
                    `Failed to load command file: ${file}`
                );
            }
        }
    } catch (error) {
        logger.handleError(error, "Error loading commands");
    }

    return commands;
}

export default loadCommands;
