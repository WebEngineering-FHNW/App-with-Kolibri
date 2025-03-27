# Server Section

Everything in the subdirectory is supposed to live on the server side.
The JS execution engine on the server side is supposed to be Node.js
(while Deno.js and others might work, they come with their own challenges).

The code has been developed and tested with that latest LTS version of Node,
which as of March 2015 was v22.14.0.

**NPM is not required and should not even be installed**.

Please also note, that there is no package.json and no node_modules folder!

## Warning

When deploying server-side code make sure that the
server runs under a **user** that has the **appropriately limited rights**,
especially for accessing the file system.

