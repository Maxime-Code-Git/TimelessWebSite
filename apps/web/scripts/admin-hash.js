import { createInterface } from "node:readline";
import * as argon2 from "@node-rs/argon2";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

if (process.argv.length > 2) {
  console.error("Les arguments en ligne de commande sont refusés par sécurité.");
  process.exit(1);
}

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  console.error("Ce script nécessite un terminal interactif (TTY).");
  process.exit(1);
}

// Hack to mask password input since readline doesn't natively support it
rl.stdoutMuted = true;
rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (rl.stdoutMuted) {
    if (stringToWrite === "\r" || stringToWrite === "\n" || stringToWrite === "\r\n") {
      process.stdout.write(stringToWrite);
    } else {
      process.stdout.write("*");
    }
  } else {
    process.stdout.write(stringToWrite);
  }
};

rl.question("Veuillez saisir le mot de passe administrateur : ", async (password) => {
  rl.close();

  if (!password) {
    console.error("\nErreur : le mot de passe est requis.");
    process.exit(1);
  }

  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    console.log("\nADMIN_PASSWORD_HASH généré avec succès :\n");
    console.log(hash);
    console.log("\nCopiez cette valeur dans votre fichier .env.local.");
  } catch {
    console.error("\nUne erreur inattendue est survenue.");
    process.exit(1);
  }
});
