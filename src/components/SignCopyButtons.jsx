import CopyButton from './CopyButton';

/**
 * Dual copy buttons for any Verus RPC command (signmessage, sendcurrency, etc).
 * GUI = `run <command>` (Verus Desktop debug console)
 * CLI = `./verus -testnet <command>` (terminal)
 */
export default function SignCopyButtons({ command, className = '' }) {
  const guiCmd = `run ${command}`;
  const cliCmd = `./verus -testnet ${command}`;

  return (
    <span className={`inline-flex gap-1.5 ${className}`}>
      <CopyButton text={guiCmd} label="GUI" />
      <CopyButton text={cliCmd} label="CLI" />
    </span>
  );
}
