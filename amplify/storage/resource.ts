import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'finfineDocumentStorage',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read', 'write', 'delete']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
  }),
});
