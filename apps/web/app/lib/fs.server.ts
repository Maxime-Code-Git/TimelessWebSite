import fs from "node:fs";

export const fsSync = {
  renameSync: fs.renameSync,
  rmSync: fs.rmSync,
};
