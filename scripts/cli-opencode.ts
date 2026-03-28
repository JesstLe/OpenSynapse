import { Command } from 'commander';
import { getOpenCodeClient, isOpenCodeAvailable } from '../src/lib/opencode/client.js';

const program = new Command();

program
  .name('opensynapse')
  .description('OpenSynapse CLI with OpenCode Agent support')
  .version('0.1.0');

program
  .command('status')
  .description('Check OpenCode connection status')
  .action(async () => {
    const available = await isOpenCodeAvailable();
    console.log(available ? '✅ OpenCode connected' : '❌ OpenCode unavailable');
    process.exit(available ? 0 : 1);
  });

program.parse();
