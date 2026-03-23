const { REST, Routes } = require('discord.js');
const fs = require('fs');
const CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const rest = new REST({ version: '10' }).setToken(CONFIG.token);

rest.get(Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId))
  .then(cmds => {
    console.log('Registered commands:');
    cmds.forEach(c => console.log(' -', c.name, '|', c.description));
  })
  .catch(e => console.error('Error:', e.message));
