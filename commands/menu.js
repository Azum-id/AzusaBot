 /**
 * Help command - Shows available commands and usage information
 */

const helpCommand = {
    name: 'help2',
    aliases: ['menu2', 'commands2'],
    description: 'Shows available commands and usage information',
    usage: '/help2 [command]',
    
    /**
     * Execute the help command
     * @param {Object} sock - The WhatsApp socket instance
     * @param {Object} msg - The message object
     * @param {Array} args - Command arguments
     * @param {Object} context - Additional context like logger
     */
    async execute(sock, msg, args, { AzusaLog }) {
        try {
            const from = msg.key.remoteJid;
            
            // Create help message
            let helpMessage = `*📱 WhatsApp Bot - Help Menu2 📱*\n\n`;
            
            // Basic commands section
            helpMessage += `*Basic Commands:*\n`;
            helpMessage += `• */help* - Show this help menu\n`;
            helpMessage += `• */ai [question]* - Ask a question to AI\n`;
            helpMessage += `• */img [prompt]* - Generate an image from text\n\n`;
            
            // Information section
            helpMessage += `*Bot Information:*\n`;
            helpMessage += `• Version: 1.0.0\n`;
            helpMessage += `• Framework: Baileys ESM\n`;
            helpMessage += `• Developer: Your Name\n\n`;
            
            // Usage example
            helpMessage += `*Example:*\n`;
            helpMessage += `*/ai What is the capital of France?*\n\n`;
            
            helpMessage += `_Type /help [command] for more info about a specific command_`;
            
            // Send the help message
            await sock.sendMessage(from, { 
                text: helpMessage 
            });
            
            AzusaLog.log({ 
                type: 'info', 
                message: `Help command executed by ${msg.pushName || 'User'}` 
            });
        } catch (err) {
            throw new Error(`Failed to execute help command: ${err.message}`);
        }
    }
};

export default helpCommand;
