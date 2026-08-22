import { hash } from "@node-rs/argon2";
import readline from "node:readline";
import { Writable } from "node:stream";

export async function generateAdminHash() {
  if (process.argv.length > 2) {
    throw new Error("Aucun argument n'est autorisé. Lancez simplement la commande.");
  }

  if ((!process.stdin.isTTY || !process.stdout.isTTY) && process.env.NODE_ENV !== 'test') {
    throw new Error("Cette commande doit être exécutée dans un terminal interactif (TTY).");
  }

  const askPassword = (promptText) => {
    return new Promise((resolve) => {
      let isMuted = false;
      const mutableStdout = new Writable({
        write(chunk, encoding, callback) {
          if (!isMuted) {
            process.stdout.write(chunk, encoding);
          }
          callback();
        },
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: mutableStdout,
        terminal: true,
      });

      process.stdout.write(promptText);
      isMuted = true;

      rl.question("", (password) => {
        rl.close();
        console.log(); // newline after hidden input
        resolve(password);
      });
    });
  };

  const password = await askPassword("Entrez le mot de passe administrateur : ");
  if (!password || password.length < 12) {
    throw new Error("Le mot de passe doit contenir au moins 12 caractères.");
  }

  const confirm = await askPassword("Confirmez le mot de passe : ");
  if (password !== confirm) {
    throw new Error("Les mots de passe ne correspondent pas.");
  }

  try {
    const hashedPassword = await hash(password);
    console.log(`\nHash généré avec succès :\n\n${hashedPassword}\n`);
    return hashedPassword;
  } catch (err) {
    throw new Error("Erreur lors de la génération du hash : " + err.message, { cause: err });
  }
}

import { fileURLToPath } from "node:url";

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (process.env.NODE_ENV !== 'test' && isMainModule) {
  generateAdminHash().catch(console.error);
}
