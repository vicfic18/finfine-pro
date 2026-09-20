import { defineFunction } from '@aws-amplify/backend';

export const statutoryAdvisoryCron = defineFunction({
  name: 'statutory-advisory-cron',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  runtime: 22,
  schedule: 'every day',
  environment: {
    FINFINE_TENANT_ID: 'msme-001',
    STATUTORY_ADVISORY_TABLE_NAME: 'StatutoryAdvisory-ifsueqzwybf6nau7duulv5qweq-NONE',
    MERCHANT_SETTINGS_TABLE_NAME: 'MerchantFinancialSettings-ifsueqzwybf6nau7duulv5qweq-NONE',
    CASH_POSITION_TABLE_NAME: 'CashPositionSnapshot-ifsueqzwybf6nau7duulv5qweq-NONE',
    OBLIGATION_TABLE_NAME: 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE',
  },
});
