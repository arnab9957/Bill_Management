// Creates the .env settings file for a NEW installation, with a random APP_SECRET.
// An existing .env is never changed: changing APP_SECRET would make saved provider passwords unreadable.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const PLACEHOLDER = "change-me-to-a-long-random-string-of-32-chars";

if (!existsSync(".env")) {
  const secret = randomBytes(32).toString("base64url");
  const example = readFileSync(".env.example", "utf8");
  writeFileSync(".env", example.replace(/^APP_SECRET=.*$/m, `APP_SECRET=${secret}`));
  console.log("Created .env with a new random APP_SECRET.");
} else {
  const current = (/^APP_SECRET=(.*)$/m.exec(readFileSync(".env", "utf8"))?.[1] ?? "").trim();
  if (current === "" || current === PLACEHOLDER) {
    console.warn("WARNING: .env still has the example APP_SECRET. Set a long random value (32 or more characters)");
    console.warn("         before saving any provider passwords. Do not change it after that: saved passwords would become unreadable.");
  }
}
