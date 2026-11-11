// Prisma's `prisma-client` generator emits TypeScript that uses ES module syntax
// (import.meta.url). The api itself is CommonJS, so without this marker Node loads the
// compiled client as CommonJS and fails at startup with
// "exports is not defined in ES module scope". A package.json declaring "type": "module"
// in the generated folder tells both tsc and Node to treat that folder as ESM; Nest's
// asset copy (nest-cli.json) carries it into dist/ so production builds get it too.
//
// The folder is gitignored and rebuilt by `prisma generate`, so this runs right after
// every generate (see the prisma:generate and postinstall scripts).
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, '..', 'generated');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'package.json'), '{\n  "type": "module"\n}\n');
console.log('Marked apps/api/generated as an ES module folder.');
