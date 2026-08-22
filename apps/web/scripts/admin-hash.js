import { hash } from "@node-rs/argon2";
import readline from "node:readline";

async function promptForPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.stdoutMuted = true;

    const originalWrite = rl.output.write;
    rl.output.write = function (data, ...args) {
      if (!rl.stdoutMuted) {
        return originalWrite.apply(rl.output, [data, ...args]);
      }
      if (data === "\r\n" || data === "\n" || data === "\r") {
        return originalWrite.apply(rl.output, [data, ...args]);
      }
      return originalWrite.apply(rl.output, ["*", ...args]);
    };

    rl.question("Entrez le mot de passe administrateur : ", (password) => {
      rl.stdoutMuted = false;
      originalWrite.apply(rl.output, ["\n"]);

      rl.stdoutMuted = true;
      rl.question("Confirmez le mot de passe : ", (confirm) => {
        rl.stdoutMuted = false;
        originalWrite.apply(rl.output, ["\n"]);
        rl.close();

        if (password !== confirm) {
          reject(new Error("Les mots de passe ne correspondent pas."));
        } else if (password.length < 8) {
          reject(new Error("Le mot de passe doit faire au moins 8 caractères."));
        } else {
          resolve(password);
        }
      });
    });
  });
}

async function generateAdminHash() {
  if (process.argv.length > 2) {
    throw new Error("Les arguments en ligne de commande sont refusés par sécurité.");
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error("Ce script nécessite un terminal interactif (TTY).");
  }

  const password = await promptForPassword();

  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  console.log("\nVoici votre nouveau hash administrateur (à placer dans ADMIN_PASSWORD_HASH) :\n");
  console.log(passwordHash);
  console.log("\nAssurez-vous également que ADMIN_SESSION_SECRET comporte au moins 32 caractères aléatoires.");
}

generateAdminHash().catch((error) => {
  console.error("Erreur lors de la génération du hash :", error.message);
  process.exitCode = 1;
});
