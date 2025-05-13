import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";
import readline from "readline";
import { parsePhoneNumber } from "libphonenumber-js";
import { Logger } from "./utils/AzusaLogger.js";
import baileys from "@whiskeysockets/baileys";
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    jidNormalizedUser,
    isJidNewsletter,
    makeInMemoryStore,
    makeCacheableSignalKeyStore
} = baileys;
import NodeCache from "node-cache";
import { Boom } from "@hapi/boom";
import pino from "pino";
import chalk from "chalk";
import figlet from "figlet";
import loadCommands from "./utils/commandLoader.js";
import config from "./config.js";

// Convert __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache with proper configurations
const msgRetryCounterCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });
const groupCache = new NodeCache({
    stdTTL: 300,
    useClones: false,
    checkperiod: 30
});
const userDevicesCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });
const processedMessagesCache = new NodeCache({
    stdTTL: 3600, // Store IDs for 1 hour
    checkperiod: 300 // Clean up every 5 minutes
});

// Connection management variables
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY = 60000; // 1 minute max delay

// Initialize logger
const AzusaLog = new Logger();

// Display banner
console.log(
    chalk.green(
        figlet.textSync(config.name, {
            font: "Standard",
            horizontalLayout: "default",
            verticalLayout: "default",
            width: 80,
            whitespaceBreak: false
        })
    )
);

// Config
const sessionName = config.session.name;
const sessionFolder = config.session.folderPath;
const commandsPath = config.command.folderPath;

// Commands container
let commands = new Map();

/**
 * Load all commands with error handling
 */
async function initializeCommands() {
    try {
        commands = await loadCommands(commandsPath);
        AzusaLog.log({
            type: "success",
            message: `Successfully loaded ${commands.size} commands.`
        });
    } catch (err) {
        AzusaLog.handleError(err, "Failed to load initial commands");
        // Create empty Map if commands failed to load to prevent crashes
        commands = new Map();
    }
}

/**
 * Watch command folder for changes with improved error handling and debouncing
 */
function setupCommandWatcher() {
    try {
        // Track which files are being processed to prevent duplicate reloads
        const processingFiles = new Set();
        const debounceTime = 500; // 500ms debounce time

        const watcher = fs.watch(commandsPath, async (eventType, filename) => {
            if (filename && filename.endsWith(".js")) {
                // Skip if this file is already being processed
                if (processingFiles.has(filename)) return;

                processingFiles.add(filename);

                AzusaLog.log({
                    type: "info",
                    message: `Detected change in ${filename}, reloading commands...`
                });

                // Debounce the reload to avoid multiple reloads for the same file
                setTimeout(async () => {
                    try {
                        const newCommands = await loadCommands(commandsPath);
                        commands = newCommands;
                        AzusaLog.log({
                            type: "success",
                            message: `Commands reloaded successfully. Total: ${commands.size}`
                        });
                    } catch (err) {
                        AzusaLog.handleError(err, "Error reloading commands");
                        // Keep existing commands on failure
                    } finally {
                        // Remove from processing set after debounce period
                        processingFiles.delete(filename);
                    }
                }, debounceTime);
            }
        });

        // Handle watcher errors
        watcher.on("error", err => {
            AzusaLog.handleError(err, "Command watcher error");

            // Try to restart the watcher
            setTimeout(() => {
                AzusaLog.log({
                    type: "info",
                    message: "Attempting to restart command watcher..."
                });
                setupCommandWatcher();
            }, 5000);
        });
    } catch (err) {
        AzusaLog.handleError(err, "Failed to set up command watcher");
        // Try to restart the watcher after a delay
        setTimeout(setupCommandWatcher, 5000);
    }
}

/**
 * Create necessary directories with error handling
 */
function ensureDirectoryExists(directory) {
    try {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
            AzusaLog.log({
                type: "info",
                message: `Created directory: ${directory}`
            });
        }
    } catch (err) {
        AzusaLog.handleError(err, `Failed to create directory: ${directory}`);
        throw err; // Re-throw as this is critical
    }
}

/**
 * Remove credentials in case of logout
 */
async function removeCreds() {
    try {
        const files = await fs.promises.readdir(sessionFolder);
        for (const file of files) {
            await fs.promises.unlink(path.join(sessionFolder, file));
        }
        return true;
    } catch (err) {
        AzusaLog.handleError(err, "Failed to remove credentials");
        return false;
    }
}

/**
 * Extract message information from WhatsApp message
 */
function extractMessageInfo(sock, msg) {
    if (!msg || !msg.key || !msg.key.remoteJid) {
        return {
            body: "",
            from: "",
            pushName: "Unknown",
            isGroup: false,
            type: ""
        };
    }

    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    const from = msg.key.remoteJid;
    const pushName = msg.pushName || "User";

    // Extract message body with enhanced error handling
    try {
        const message = msg.message || {};
        const type = Object.keys(message)[0] || "";
        let body = "";

        switch (type) {
            case "conversation":
                body = message.conversation || "";
                break;
            case "imageMessage":
                body = message.imageMessage?.caption || "";
                break;
            case "videoMessage":
                body = message.videoMessage?.caption || "";
                break;
            case "extendedTextMessage":
                body = message.extendedTextMessage?.text || "";
                break;
            case "buttonsResponseMessage":
                body = message.buttonsResponseMessage?.selectedButtonId || "";
                break;
            case "listResponseMessage":
                body =
                    message.listResponseMessage?.singleSelectReply
                        ?.selectedRowId || "";
                break;
            case "templateButtonReplyMessage":
                body = message.templateButtonReplyMessage?.selectedId || "";
                break;
            default:
                body = "";
        }

        return { body, from, pushName, isGroup, type };
    } catch (err) {
        AzusaLog.handleError(err, "Error extracting message info");
        return { body: "", from, pushName, isGroup, type: "" };
    }
}

/**
 * Setup pairing code request with error handling
 */
async function setupPairingCode(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const getTimestamp = () => {
        return `[${moment()
            .tz("Asia/Jakarta")
            .format("YYYY-MM-DD HH:mm:ss")}][*]`;
    };

    const prompt = question =>
        new Promise(resolve =>
            rl.question(`${getTimestamp()} ${question}`, resolve)
        );

    try {
        const rawPhoneNumber = (
            await prompt("Please type your WhatsApp number: ")
        ).replace(/[^0-9]/g, "");

        // Validate phone number
        let phoneNumber;
        try {
            phoneNumber = parsePhoneNumber("+" + rawPhoneNumber);

            if (!phoneNumber.isValid()) {
                throw new Error("Invalid phone number format");
            }
        } catch (err) {
            AzusaLog.log({
                type: "error",
                message:
                    "Invalid number. Start with your country's WhatsApp code, e.g., 628xxx"
            });
            rl.close();
            process.exit(1);
            return;
        }

        AzusaLog.log({
            type: "info",
            message: `Bot Number: ${phoneNumber.number}`
        });

        try {
            const pairingCode = await sock.requestPairingCode(rawPhoneNumber);

            if (!pairingCode) {
                throw new Error("Failed to get pairing code");
            }

            AzusaLog.log({
                type: "info",
                message: `Pairing Code: ${pairingCode
                    .match(/.{1,4}/g)
                    .join("-")}`
            });
        } catch (err) {
            AzusaLog.handleError(err, "Error requesting pairing code");
            process.exit(1);
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error in pairing process");
        process.exit(1);
    } finally {
        rl.close();
    }
}

/**
 * Process incoming messages
 */
async function handleIncomingMessage(sock, msg, chatUpdate) {
    try {
        // Skip invalid messages
        if (!msg || !msg.message) return;

        // Skip status broadcasts and non-user messages
        if (msg.key.remoteJid === "status@broadcast") return;
        if (msg.key.id.startsWith("BAE5") && msg.key.id.length === 16) return;

        // Check if message has already been processed
        const messageId = msg.key.id;
        if (processedMessagesCache.has(messageId)) {
            AzusaLog.log({
                type: "info",
                message: "Received Duplicate Message, Skipping!"
            });
            return; // Skip processing if already handled
        }

        // Mark as processed
        processedMessagesCache.set(messageId, true);

        await sock.readMessages([msg.key]);

        const { body, from, pushName, isGroup, type } = extractMessageInfo(
            sock,
            msg
        );

        if (!body || !from) {
            return; // Skip processing if essential data is missing
        }

        // Process command
        const prefixes = config.command.prefixes;
        const usedPrefix = prefixes.find(p => body.startsWith(p));

        if (usedPrefix) {
            const args = body.slice(usedPrefix.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            if (command && commands.has(command)) {
                let groupName = "";
                if (isGroup) {
                    try {
                        const meta = await sock.groupMetadata(from);
                        groupName = meta.subject || "Unknown Group";
                    } catch {
                        groupName = "Unknown Group";
                    }
                }

                // Tentukan konteks chat
                const chatContext = isGroup ? groupName : "Private Chat";

                // Log dengan format baru
                AzusaLog.log({
                    type: "success",
                    message: `${chalk.green(command)} from ${chalk.yellow(
                        pushName
                    )} in ${chalk.blueBright(chatContext)}`
                });
                const commandFile = commands.get(command);
                try {
                    await commandFile.execute(sock, msg, args, {
                        AzusaLog,
                        store,
                        from,
                        isGroup,
                        pushName,
                        type
                    });
                } catch (err) {
                    AzusaLog.handleError(
                        err,
                        `Error executing command ${command}`
                    );

                    // Send error message to user
                    try {
                        await sock.sendMessage(from, {
                            text: `Error executing command: ${
                                err.message || "Unknown error"
                            }`
                        });
                    } catch (sendErr) {
                        AzusaLog.handleError(
                            sendErr,
                            "Failed to send error message"
                        );
                    }
                }
            }
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error processing message");
    }
}
/**
 * Handle group updates with error handling
 */
async function handleGroupUpdate(sock, event) {
    try {
        if (!event || !event.id) return;

        try {
            const metadata = await sock.groupMetadata(event.id);
            if (metadata) {
                groupCache.set(event.id, metadata);
            }
        } catch (err) {
            AzusaLog.handleError(
                err,
                `Failed to update metadata for group ${event.id}`
            );
            // Remove potentially corrupted cache entry
            groupCache.del(event.id);
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error handling group update");
    }
}

/**
 * Handle group participant updates with error handling
 */
async function handleGroupParticipantUpdate(sock, event) {
    try {
        if (!event || !event.id) return;

        try {
            const metadata = await sock.groupMetadata(event.id);
            if (metadata) {
                groupCache.set(event.id, metadata);
            }
        } catch (err) {
            AzusaLog.handleError(
                err,
                `Failed to update participants for group ${event.id}`
            );
            // Don't delete the cache here, just log the error
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error handling group participant update");
    }
}

/**
 * Handle connection state updates with improved reconnection logic
 */
async function handleConnectionUpdate(sock, update) {
    try {
        const { connection, lastDisconnect } = update || {};

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 500;
            const reason = lastDisconnect?.error?.message || "Unknown";

            AzusaLog.log({
                type: "danger",
                message: `Connection closed. Status: ${statusCode}. Reason: ${reason}`
            });

            // Handle permanent disconnection scenarios
            if (
                statusCode === DisconnectReason.loggedOut ||
                statusCode === 401 ||
                statusCode === 403
            ) {
                AzusaLog.log({
                    type: "error",
                    message:
                        "Session has been terminated. Please re-authenticate."
                });

                const credsRemoved = await removeCreds();
                if (credsRemoved) {
                    AzusaLog.log({
                        type: "info",
                        message: "Credentials removed successfully."
                    });
                }

                process.exit(1);
                return;
            }

            // Progressive reconnection with exponential backoff
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;

                // Calculate delay with exponential backoff (max 1 minute)
                const delay = Math.min(
                    1000 * Math.pow(1.5, reconnectAttempts),
                    MAX_RECONNECT_DELAY
                );

                AzusaLog.log({
                    type: "warning",
                    message: `Reconnecting in ${(delay / 1000).toFixed(
                        1
                    )}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
                });

                setTimeout(() => {
                    connectToWhatsApp().catch(err => {
                        AzusaLog.handleError(
                            err,
                            "Failed to restart WhatsApp connection"
                        );

                        // If we've reached max attempts, exit process for supervisor to restart
                        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                            AzusaLog.log({
                                type: "danger",
                                message:
                                    "Max reconnection attempts reached. Exiting process."
                            });
                            process.exit(1);
                        }
                    });
                }, delay);
            } else {
                AzusaLog.log({
                    type: "danger",
                    message:
                        "Maximum reconnection attempts exceeded. Exiting process."
                });
                process.exit(1);
            }
        } else if (connection === "connecting") {
            AzusaLog.log({
                type: "info",
                message: "Connecting to WhatsApp..."
            });
        } else if (connection === "open") {
            // Reset reconnection counter on successful connection
            reconnectAttempts = 0;

            AzusaLog.log({
                type: "success",
                message: "Bot successfully connected to WhatsApp."
            });
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error handling connection update");

        // Force reconnect if connection handler itself fails
        setTimeout(() => {
            connectToWhatsApp().catch(connErr => {
                AzusaLog.handleError(
                    connErr,
                    "Failed to reconnect after connection handler error"
                );
            });
        }, 5000);
    }
}

// Initialize store
const store = makeInMemoryStore({
    logger: pino({ level: "silent" })
});

store.readFromFile = async function (file) {
    try {
        if (fs.existsSync(file)) {
            this.fromJSON(JSON.parse(fs.readFileSync(file)));
            AzusaLog.log({
                type: "info",
                message: "Store loaded from file successfully"
            });
        }
    } catch (err) {
        AzusaLog.handleError(err, "Error reading store from file");
        // Continue with empty store
    }
};

store.writeToFile = function (file) {
    try {
        fs.writeFileSync(file, JSON.stringify(this.toJSON(), null, 2));
    } catch (err) {
        AzusaLog.handleError(err, "Error writing store to file");
    }
};

// Main connection function
async function connectToWhatsApp() {
    try {
        // Ensure session directory exists
        ensureDirectoryExists(sessionFolder);

        // Load store if file exists
        await store.readFromFile("./store.json");

        // Set up periodic store saving
        setInterval(() => {
            store.writeToFile("./store.json");
        }, 10000);

        // Get auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

        // Fetch latest Baileys version
        let version, isLatest;
        try {
            const versionInfo = await fetchLatestBaileysVersion();
            version = versionInfo.version;
            isLatest = versionInfo.isLatest;
        } catch (err) {
            AzusaLog.handleError(err, "Failed to fetch Baileys version");
            // Use default version
            version = [2, 2319, 6];
            isLatest = false;
        }

        AzusaLog.log({
            type: "info",
            message: `Using WA v${version.join(".")}, isLatest: ${isLatest}`
        });

        // Create WhatsApp socket with robust configuration
        const sock = makeWASocket({
            version,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                // Use caching for better key handling
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({ level: "silent" })
                )
            },
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: true,
            msgRetryCounterCache,
            userDevicesCache,
            shouldIgnoreJid: jid => isJidBroadcast(jid) || isJidNewsletter(jid),
            defaultQueryTimeoutMs: 60000, // 60 seconds timeout for queries
            retryRequestDelayMs: 250, // Increased from 10ms for better stability
            connectTimeoutMs: 60000,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 250 // Increased from 10ms
            },
            keepAliveIntervalMs: 15000, // Increased from 10000ms
            syncFullHistory: false,
            shouldSyncHistoryMessage: msg => {
                try {
                    AzusaLog.log({
                        type: "info",
                        message: `Syncing chat history... [${
                            msg.progress || 0
                        }%]`
                    });
                    return !!msg.syncType;
                } catch (err) {
                    AzusaLog.handleError(err, "Error in history sync callback");
                    return false;
                }
            },
            cachedGroupMetadata: async jid => {
                try {
                    return groupCache.get(jid);
                } catch (err) {
                    AzusaLog.handleError(
                        err,
                        "Error retrieving cached group metadata"
                    );
                    return null;
                }
            },
            patchMessageBeforeSending: (message, jids) => {
                try {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );

                    if (requiresPatch) {
                        message = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadataVersion: 2,
                                        deviceListMetadata: {}
                                    },
                                    ...message
                                }
                            }
                        };
                    }

                    return message;
                } catch (err) {
                    AzusaLog.handleError(err, "Error patching message");
                    return message; // Return unpatched message to avoid crashes
                }
            },
            getMessage: async key => {
                try {
                    AzusaLog.log({
                        type: "info",
                        message: "Getting message for retry..."
                    });

                    if (store) {
                        const msg = await store.loadMessage(
                            key.remoteJid,
                            key.id
                        );
                        return msg?.message || undefined;
                    }

                    return undefined;
                } catch (err) {
                    AzusaLog.handleError(
                        err,
                        "Failed to get message from store"
                    );
                    return undefined;
                }
            }
        });

        // Handle authentication with pairing code if needed
        if (!sock.authState.creds.registered) {
            await setupPairingCode(sock);
        }

        // Bind store to socket events
        store.bind(sock.ev);

        // Process all events in a batch using the new ev.process method
        sock.ev.process(async events => {
            // Credentials update event
            if (events["creds.update"]) {
                try {
                    await saveCreds();
                } catch (err) {
                    AzusaLog.handleError(err, "Failed to save credentials");
                }
            }

            // Messages upsert event
            if (events["messages.upsert"]) {
                try {
                    const chatUpdate = events["messages.upsert"];
                    if (
                        !chatUpdate.messages?.length ||
                        chatUpdate.type !== "notify"
                    )
                        return;

                    // Remove or comment out this line to avoid excessive logging
                    // console.log(chatUpdate);

                    // Track processed message IDs to prevent duplicates
                    const processedMessageIds = new Set();

                    // Process all messages in the update
                    for (const msg of chatUpdate.messages) {
                        // Skip if message ID has already been processed
                        if (msg.key && msg.key.id) {
                            // Check if we've already processed this message
                            if (processedMessageIds.has(msg.key.id)) {
                                continue;
                            }
                            // Add to processed set
                            processedMessageIds.add(msg.key.id);
                        }

                        await handleIncomingMessage(sock, msg, chatUpdate);
                    }
                } catch (err) {
                    AzusaLog.handleError(
                        err,
                        "Error in messages.upsert handler"
                    );
                }
            }

            // Groups update event
            if (events["groups.update"]) {
                try {
                    const groupEvents = events["groups.update"];
                    if (!groupEvents || !Array.isArray(groupEvents)) return;

                    for (const event of groupEvents) {
                        await handleGroupUpdate(sock, event);
                    }
                } catch (err) {
                    AzusaLog.handleError(err, "Error in groups.update handler");
                }
            }

            // Group participants update event
            if (events["group-participants.update"]) {
                try {
                    const event = events["group-participants.update"];
                    if (!event) return;
                    await handleGroupParticipantUpdate(sock, event);
                } catch (err) {
                    AzusaLog.handleError(
                        err,
                        "Error in group-participants.update handler"
                    );
                }
            }

            // Connection update event
            if (events["connection.update"]) {
                handleConnectionUpdate(sock, events["connection.update"]);
            }
        });

        return sock;
    } catch (err) {
        AzusaLog.handleError(err, "Fatal error in connectToWhatsApp");

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Recursive call for retry
        return connectToWhatsApp();
    }
}

// Setup for graceful shutdown
process.on("SIGINT", async () => {
    AzusaLog.log({
        type: "warning",
        message: "Received SIGINT. Shutting down gracefully..."
    });

    try {
        store.writeToFile("./store.json");
        AzusaLog.log({
            type: "info",
            message: "Store saved successfully."
        });
    } catch (err) {
        AzusaLog.handleError(err, "Error saving store during shutdown");
    }

    process.exit(0);
});

process.on("SIGTERM", async () => {
    AzusaLog.log({
        type: "warning",
        message: "Received SIGTERM. Shutting down gracefully..."
    });

    try {
        store.writeToFile("./store.json");
        AzusaLog.log({
            type: "info",
            message: "Store saved successfully."
        });
    } catch (err) {
        AzusaLog.handleError(err, "Error saving store during shutdown");
    }

    process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", err => {
    AzusaLog.handleError(err, "Uncaught Exception");

    // Don't exit process for uncaught exceptions unless critical
    if (
        err.message &&
        (err.message.includes("FATAL") ||
            err.message.includes("Cannot read") ||
            err.message.includes("undefined is not"))
    ) {
        AzusaLog.log({
            type: "danger",
            message: "Critical error detected. Exiting process for safety."
        });
        process.exit(1);
    }
});

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
    AzusaLog.handleError(
        reason instanceof Error ? reason : new Error(String(reason)),
        "Unhandled Rejection"
    );
});

// Setup file watcher for development hot reload
function setupHotReload() {
    try {
        fs.watchFile(fileURLToPath(import.meta.url), () => {
            fs.unwatchFile(fileURLToPath(import.meta.url));
            AzusaLog.log({
                type: "warning",
                message: "Main file updated. Restarting..."
            });

            // Save store before exit
            store.writeToFile("./store.json");

            process.exit(0);
        });
    } catch (err) {
        AzusaLog.handleError(err, "Error setting up hot reload");
    }
}

// Initialize and start the bot
async function startBot() {
    try {
        // Load commands first
        await initializeCommands();

        // Setup command watcher
        setupCommandWatcher();

        // Setup hot reload for development
        setupHotReload();

        // Start WhatsApp connection
        await connectToWhatsApp();
    } catch (err) {
        AzusaLog.handleError(err, "Critical error starting bot");
        process.exit(1);
    }
}

// Start the bot
startBot();
