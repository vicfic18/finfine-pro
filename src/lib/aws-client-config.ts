/* eslint-disable @typescript-eslint/no-explicit-any */
export function getAwsClientConfig(region?: string): Record<string, any> {
  const accessKeyId = process.env.FINFINE_AWS_ACCESS_KEY_ID || process.env.APP_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FINFINE_AWS_SECRET_ACCESS_KEY || process.env.APP_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.FINFINE_AWS_SESSION_TOKEN || process.env.APP_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
  const targetRegion = region || process.env.AWS_REGION || 'ap-south-1';

  const config: Record<string, any> = {
    region: targetRegion,
  };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      ...(sessionToken ? { sessionToken: sessionToken.trim() } : {}),
    };
  }

  return config;
}
