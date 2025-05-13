# WhatsApp Bot with Baileys

A modular WhatsApp bot built with Baileys library using ESM format, featuring improved error handling, security features, and a modular command structure.

## Features

- **ESM Format**: Modern JavaScript module system
- **Pairing Code Login**: More reliable authentication method
- **Modular Commands**: Each command in its own file for easy management
- **Improved Error Handling**: Using AzusaLogger for better error tracking
- **Enhanced Security**: Configuration options for access control

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/whatsapp-bot.git
cd whatsapp-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure the bot:
   - Edit `config.js` to set your OpenAI API key and other preferences
   - Set environment variables if preferred:
     ```bash
     export OPENAI_API_KEY="your-api-key"
     ```

4. Start the bot:
```bash
npm start
```

## Authentication

This bot uses WhatsApp's pairing code authentication method. When you run the bot for the first time:

1. You'll be prompted to enter your phone number (with country code)
2. A pairing code will be displayed in the console
3. Enter this code in your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices > Link a Device
   - When the QR scanner appears, tap "Link with phone number instead"
   - Enter the pairing code shown in the console

## Adding New Commands

1. Create a new file in the `commands` folder, following this template:

```javascript
const myCommand = {
    name: 'commandname',
    aliases: ['alias1', 'alias2'],
    description: 'Command description',
    usage: '/commandname [args]',
    
    async execute(sock, msg, args, { AzusaLog }) {
        // Command logic here
        const from = msg.key.remoteJid;
        await sock.sendMessage(from, { text: 'Command response' });
    }
};

export default myCommand;
```

2. The command will be automatically loaded when the bot starts.

## Security

You can enhance security by:

1. Editing the security section in `config.js`
2. Using environment variables for sensitive information
3. Adding more validation in command files

## License

MIT

## Credits

- [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- AzusaLogger - For beautiful console logging
