import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * list - Menampilkan semua command yang tersedia (dibaca langsung dari folder)
 */

const command = {
    name: "list",
    aliases: ["commands"],
    description: "List available commands",
    usage: "/list",

    /**
     * Execute the list command
     * @param {Object} sock - The WhatsApp socket instance
     * @param {Object} msg - The message object
     * @param {Array} args - Command arguments
     * @param {Object} context - Additional context like logger
     */
    async execute(sock, msg, args, { AzusaLog, from, pushName }) {
        try {
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const commandsDir = path.resolve(__dirname, "..", "commands");

            if (!fs.existsSync(commandsDir)) {
                await sock.sendMessage(from, {
                    text: "Tidak ada folder commands ditemukan."
                });
                return;
            }

            const files = fs.readdirSync(commandsDir).filter(file => file.endsWith(".js"));

            // Ambil nama command dari masing-masing file
            const commandNames = [];
            for (const file of files) {
                const filePath = path.join(commandsDir, file);
                const commandModule = await import(`file://${filePath}`);
                if (commandModule.default && commandModule.default.name) {
                    commandNames.push(commandModule.default.name);
                }
            }

            if (commandNames.length === 0) {
                await sock.sendMessage(from, {
                    text: "Belum ada command yang tersedia."
                });
                return;
            }

            const commandListText = `Hi ${pushName}!\nBerikut daftar command yang tersedia:\n\n` +
                commandNames.map(name => `• ${name}`).join("\n");

            await sock.sendMessage(from, {
                text: commandListText
            });

            AzusaLog.log({
                type: "info",
                message: `Command list dipanggil oleh ${pushName}`
            });

        } catch (err) {
            throw new Error(`Gagal menjalankan command list: ${err.message}`);
        }
    }
};

export default command;
