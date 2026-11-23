import { providers } from '../server/tmdb.js';
const data = await providers('PT');
console.log(
  JSON.stringify(
    { region: 'PT', validatedAt: new Date().toISOString(), providers: data },
    null,
    2,
  ),
);
