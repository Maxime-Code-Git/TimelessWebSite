export function createE2EEnvironment(tempRoot: string, sourceEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function getE2ESmtpPaths(env: NodeJS.ProcessEnv): { smtpInboxPath: string; smtpModePath: string; };
export function run(): Promise<void>;
