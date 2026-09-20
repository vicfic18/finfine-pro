import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'finfineDocumentStorage',
  // Browser clients have no direct object permissions. Uploads are mediated by
  // the authenticated server route, which derives the tenant prefix from sub.
  access: () => ({}),
});
