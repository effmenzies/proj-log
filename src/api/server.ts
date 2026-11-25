import { createDatabaseClient } from "../database/client.js";
import { createApp } from "./app.js";

const client = createDatabaseClient();
const port = Number(process.env.PORT ?? 3000);
const server = createApp(client).listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => { void client.$disconnect().finally(() => process.exit(0)); });
  });
}
