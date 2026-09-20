import { handler } from './handler';

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  console.info = (...values: unknown[]) => console.error(...values);
  console.warn = (...values: unknown[]) => console.error(...values);
  const input = JSON.parse(await readStandardInput()) as { audioBase64?: unknown; mode?: unknown };
  const result = await handler(input);
  process.stdout.write(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Local transcriber failed');
  process.exitCode = 1;
});
