// Configuration for the WhatsApp bot
export default {
    // Bot info
    name: "Bot-Name",
    botNumber: "628xxxxx", // Bot Number for loging in

    owner: ["628xxx"], // Replace with your number
    timezone: "Asia/Jakarta",

    // OpenAI configuration
    openai: {
        apiKey: "YOUR_OPENAI_API_KEY", // Best to use environment variables
        model: "gpt-4",
        imageSize: "512x512"
    },

    // Session configuration
    session: {
        name: "whatsapp-session",
        folderPath: "./session"
    },

    // Commands Configuration

    command: {
        folderPath: "./commands",
        prefixes: ["/", "!", "."]
    },
    // Bot appearance
    appearance: {
        // browser: ["WA-Bot", "Chrome", "1.0.0"]
    },

    // Security settings
    security: {
        allowedNumbers: [], // Empty array means all numbers are allowed
        blockedNumbers: [], // Numbers to block
        whitelistOnly: false, // If true, only allowed numbers can use the bot
        adminNumbers: ["628xxx"] // Admin numbers that can use admin commands
    }
};

