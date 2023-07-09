#!/usr/bin/env node

import cliProgress from "cli-progress";
import glob from "fast-glob";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import { $ } from "zx";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    AWS_ACCOUNT_ID: z.string(),
    AWS_VAULT_NAME: z.string(),
    PARALLEL_PROCESS_COUNT: z.number().default(8),
  },
});

async function getFilesFromFolder(folder: string): Promise<string[]> {
  // if the folder don't exist, create it
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, {
      recursive: true,
    });
  }
  const result = await glob(`${folder}/*`);
  return result;
}

async function parseIdsFromFile(jsonPath: string): Promise<string[]> {
  const result = await fsPromises.readFile(jsonPath, "utf-8");
  return result.split("\n");
}

async function getAllIdsFromFolder(folder: string): Promise<string[]> {
  const files = await getFilesFromFolder(folder);
  const promises = files.map(parseIdsFromFile);
  const results = await Promise.all(promises);
  const concatenated = ([] as string[]).concat(...results);
  return [...new Set(concatenated)];
}

(async function () {
  // parse the first input parameter as the path to the folder containing the json files
  const folderPath = process.argv[2];
  if (!folderPath) {
    console.error("Please provide the path to the job-output.json");
    process.exit(1);
  }
  // load the file
  const jobOutputPath = path.join(process.cwd(), folderPath);
  const jobOutputRaw = await fsPromises.readFile(jobOutputPath, "utf-8");
  const parsedJobOutput = JSON.parse(jobOutputRaw);
  const archiveIds = parsedJobOutput.ArchiveList.map(
    (archive: any) => archive.ArchiveId
  );

  // get olf log files, to pick up missing archives
  const errorIds = await getAllIdsFromFolder(
    path.join(os.tmpdir(), "clear-aws-glacier", "error")
  );
  const successIds = await getAllIdsFromFolder(
    path.join(os.tmpdir(), "clear-aws-glacier", "success")
  );

  const idQueue = [...new Set([...archiveIds, ...errorIds])].filter(
    (id) => !successIds.includes(id)
  );

  // create log files in tmp folder
  const successLogPath = path.join(
    os.tmpdir(),
    "clear-aws-glacier",
    "success",
    `${+new Date()}`
  );
  const successLogStream = fs.createWriteStream(successLogPath, {
    flags: "a",
  });
  const errorLogPath = path.join(
    os.tmpdir(),
    "clear-aws-glacier",
    "error",
    `${+new Date()}`
  );
  const errorLogStream = fs.createWriteStream(errorLogPath, {
    flags: "a",
  });

  let verbose = false;
  $.verbose = false;
  // pass the additional arguments to the aws cli
  const additionalAwsCliArguments = process.argv.slice(3).filter(arg => arg !== "--verbose");
  if (process.argv.includes("--verbose")) {
    verbose = true;
    $.verbose = true;
  };

  // initiate progress bar
  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  if (!verbose) {
    progressBar.start(idQueue.length, 0);
  }

  // set the number of promises to run simultaneously
  const parallelProcessCount = env.PARALLEL_PROCESS_COUNT;
  let i = 0;

  async function processQueue() {
    while (i < idQueue.length) {
      const promises = [] as Promise<boolean>[];
      for (let j = 0; j < parallelProcessCount && i < idQueue.length; j++) {
        const archiveId = idQueue[i];
        promises.push(
          new Promise((resolve, reject) => {
            $`aws glacier delete-archive --account-id ${env.AWS_ACCOUNT_ID} --vault-name ${env.AWS_VAULT_NAME} --archive-id \\"${archiveId}\\" ${additionalAwsCliArguments}`
              .then(() => {
                successLogStream.write(`${archiveId}\n`);
                resolve(true);
              })
              .catch((err) => {
                if (
                  err.stderr.includes(
                    "Error when retrieving token from sso: Token has expired and refresh failed"
                  )
                ) {
                  return reject();
                }
                errorLogStream.write(`${archiveId}\n`);
                resolve(true);
              });
          })
        );
        i++;
      }
      try {
        await Promise.all(promises);
        if (!verbose) {
          progressBar.increment(promises.length);
        }
      } catch {
        break;
      }
    }
  }

  processQueue().finally(async () => {
    if (!verbose) {
      progressBar.stop();
    }
    successLogStream.end();
    errorLogStream.end();
  });
})();
